import { NextRequest, NextResponse } from 'next/server';
import type { Browser, HTTPRequest, HTTPResponse, Frame } from 'puppeteer';
import { getM3u8Cache, saveM3u8Cache, cleanExpiredCache } from '@/lib/m3u8-cache';
// ✅ SEGURIDAD: Usar configuración segura sin --no-sandbox
import { createSecureBrowser, createSecurePage, isAllowedDomain, UA } from '@/lib/secure-puppeteer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ✅ ELIMINADO: getBrowser() inseguro
// Ahora se usa createSecureBrowser() de secure-puppeteer.ts

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') || 'movie').toLowerCase();
  const id = searchParams.get('id');
  const season = searchParams.get('season') || undefined;
  const episode = searchParams.get('episode') || undefined;
  const skipCache = searchParams.get('skipCache') === 'true'; // Forzar bypass del cache

  if (!id) {
    return NextResponse.json({ error: 'Falta parámetro id' }, { status: 400 });
  }

  // 🚀 PASO 1: Intentar obtener del cache (sin validar URL para máxima velocidad)
  if (!skipCache) {
    const cached = await getM3u8Cache(type, id, season, episode, false); // ⚡ false = no validar (los m3u8 son permanentes)
    if (cached) {
      const ageDays = ((Date.now() - cached.timestamp) / 1000 / 60 / 60 / 24).toFixed(1);
      console.log(`⚡ [CACHE-HIT] Usando m3u8 cacheado (${ageDays} días) para ${type}/${id}${season ? `/s${season}e${episode}` : ''}`);
      return NextResponse.json({
        streamUrl: cached.streamUrl,
        sourceUrl: cached.sourceUrl,
        type: cached.type,
        id: cached.id,
        season: cached.season,
        episode: cached.episode,
        cached: true,
        cacheAgeDays: parseFloat(ageDays),
      });
    }
  }

  // 🧹 Limpieza periódica del cache (solo 10% de las veces para no impactar performance)
  if (Math.random() < 0.1) {
    cleanExpiredCache().catch(() => {});
  }

  const isTv = type === 'tv';
  const sourceUrl = isTv
    ? `https://111movies.com/tv/${id}/${season ?? ''}/${episode ?? ''}`
    : `https://111movies.com/movie/${id}`;

  let browser: Browser | null = null;
  let page = null;

  try {
    // ✅ SEGURIDAD: Validar dominio y usar browser seguro
    if (!isAllowedDomain(sourceUrl)) {
      throw new Error(`Dominio no permitido: ${sourceUrl}`);
    }
    
    browser = await createSecureBrowser();
    page = await createSecurePage(browser);
    
    // Bloquear recursos innecesarios para mayor velocidad
    await page.setRequestInterception(true);
    
    let foundUrl: string | null = null;
    let resolveFound: ((value: string) => void) | null = null;
    const foundPromise = new Promise<string>((resolve) => {
      resolveFound = resolve;
    });

    page.on('request', (req: HTTPRequest) => {
      const url = req.url();
      const resourceType = req.resourceType();
      
      // Bloquear imágenes, fuentes, CSS para acelerar
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
        return;
      }
      
      // Detectar m3u8
      if (!foundUrl && (/\.m3u8(\?|$)/i.test(url) || /workers\.dev/i.test(url))) {
        foundUrl = url;
        if (resolveFound) resolveFound(url);
      }
      
      req.continue();
    });

    page.on('response', async (res: HTTPResponse) => {
      const url = res.url();
      if (!foundUrl && (/\.m3u8(\?|$)/i.test(url) || /workers\.dev/i.test(url))) {
        foundUrl = url;
        if (resolveFound) resolveFound(url);
      }
    });

    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ Referer: sourceUrl, Origin: new URL(sourceUrl).origin });

    // Timeout más agresivo
    await page.goto(sourceUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });

    // Intentar clicks pero con race condition
    const clickAttempt = (async () => {
      const selectors = [
        '.vjs-big-play-button',
        '.jw-icon-play',
        '#play',
        '[data-action="play"]',
        'button[aria-label="Play"]',
      ];

      for (const sel of selectors) {
        if (foundUrl) return; // Early exit
        try { 
          const el = await page!.$(sel); 
          if (el) await el.click(); 
        } catch {}
      }

      // Intentar dentro de iframes
      for (const frame of page!.frames() as Frame[]) {
        if (foundUrl) return; // Early exit
        for (const sel of selectors) {
          try { 
            const h = await frame.$(sel); 
            if (h) await h.click(); 
          } catch {}
        }
      }
    })();

    // Race: o encuentra la URL o timeout de 3 segundos (reducido de 5)
    const result = await Promise.race([
      foundPromise,
      clickAttempt.then(() => new Promise(r => setTimeout(r, 3000))).then(() => null)
    ]);

    // Último intento: buscar en HTML
    if (!foundUrl) {
      const html = await page.content();
      const matches = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/gi) || [];
      if (matches.length > 0) {
        foundUrl = matches[0] ?? null;
      }
    }

    if (foundUrl) {
      // 💾 Guardar en cache para futuras peticiones
      saveM3u8Cache(type, id, foundUrl, sourceUrl, season, episode).catch(() => {});

      return NextResponse.json({ 
        streamUrl: foundUrl, 
        sourceUrl, 
        type, 
        id, 
        season, 
        episode,
        cached: false 
      });
    }

    return NextResponse.json({ error: 'No se encontró .m3u8', sourceUrl }, { status: 404 });
  } catch (error: any) {
    console.error(`❌ [111MOVIES] Error capturando stream:`, error?.message);
    return NextResponse.json({ error: 'Error capturando stream', message: error?.message }, { status: 500 });
  } finally {
    // 🔥 CRÍTICO: Cerrar SIEMPRE el browser para evitar leaks
    if (page) {
      try {
        await page.close();
        console.log('✅ [111MOVIES] Página cerrada');
      } catch (e) {
        console.error('❌ [111MOVIES] Error cerrando página:', e);
      }
    }
    if (browser) {
      try {
        await browser.close();
        console.log('✅ [111MOVIES] Browser cerrado');
      } catch (e) {
        console.error('❌ [111MOVIES] Error cerrando browser:', e);
      }
    }
  }
}