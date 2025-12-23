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
  const tmdbId = searchParams.get('id'); // TMDB ID
  const season = searchParams.get('season') || undefined;
  const episode = searchParams.get('episode') || undefined;
  const skipCache = searchParams.get('skipCache') === 'true';

  if (!tmdbId) {
    return NextResponse.json({ error: 'Falta parámetro id (TMDB)' }, { status: 400 });
  }

  // Cache key usando TMDB ID
  const cacheKey = `videasy-${type}-${tmdbId}${season ? `-s${season}e${episode}` : ''}`;

  // 🚀 PASO 1: Intentar obtener del cache
  if (!skipCache) {
    const cached = await getM3u8Cache(`videasy-${type}`, tmdbId, season, episode, false);
    if (cached) {
      const ageDays = ((Date.now() - cached.timestamp) / 1000 / 60 / 60 / 24).toFixed(1);
      console.log(`⚡ [VIDEASY-CACHE-HIT] Usando m3u8 cacheado (${ageDays} días) para ${type}/${tmdbId}${season ? `/s${season}e${episode}` : ''}`);
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

  // 🧹 Limpieza periódica del cache
  if (Math.random() < 0.1) {
    cleanExpiredCache().catch(() => {});
  }

  const isTv = type === 'tv';
  // Videasy usa TMDB ID directamente
  const sourceUrl = isTv
    ? `https://player.videasy.net/tv/${tmdbId}/${season ?? '1'}/${episode ?? '1'}`
    : `https://player.videasy.net/movie/${tmdbId}`;

  let browser: Browser | null = null;
  let page = null;

  try {
    // ✅ SEGURIDAD: Validar dominio y usar browser seguro
    if (!isAllowedDomain(sourceUrl)) {
      throw new Error(`Dominio no permitido: ${sourceUrl}`);
    }
    
    console.log(`🚀 [VIDEASY-SECURE] Iniciando browser SEGURO para ${sourceUrl}`);
    browser = await createSecureBrowser();
    page = await createSecurePage(browser);
    
    // ✅ Ya configurado por createSecurePage(): viewport, UA, headers, anti-detección
    
    // Monitoreo de requests (seguro)
    await page.evaluateOnNewDocument(() => {
      try {
        (window as any).__reqs = [];
        
        const origFetch = window.fetch;
        window.fetch = async function(...args: any[]) {
          try {
            const u = args[0] && (args[0] as any).url ? (args[0] as any).url : String(args[0]);
            if (u) (window as any).__reqs.push({ type: 'fetch', url: u });
          } catch {}
          return origFetch.apply(this, args as [RequestInfo, RequestInit?]);
        };
        
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method: string, url: string, ...rest: any[]) {
          try {
            if (url) (window as any).__reqs.push({ type: 'xhr', url });
          } catch {}
          return origOpen.call(this, method, url, ...rest);
        };
        
        const noopOpen = function() { return null; };
        try { window.open = noopOpen as any; } catch {}
      } catch {}
    });
    
    // Sistema de candidatos como en capture-111movies-puppeteer.mjs
    const candidates: Array<{ url: string; source: string; score: number }> = [];
    const seen = new Set<string>();
    let foundUrl: string | null = null;
    
    function scoreUrl(u: string): number {
      let s = 0;
      if (/\.m3u8(\?|$)/i.test(u)) s += 100;
      if (/workers\.dev/i.test(u)) s += 10;
      if (/file2\//i.test(u)) s += 5;
      return s;
    }
    
    function addCandidate(u: string, source: string) {
      if (!u || seen.has(u)) return;
      seen.add(u);
      const score = scoreUrl(u);
      candidates.push({ url: u, source, score });
      console.log(`📋 [VIDEASY] Candidato: ${u.substring(0, 80)}... | fuente=${source} | score=${score}`);
      
      // Si es un m3u8 claro, guardarlo inmediatamente
      if (/\.m3u8(\?|$)/i.test(u) && !foundUrl) {
        foundUrl = u;
      }
    }
    
    // Bloquear recursos innecesarios
    await page.setRequestInterception(true);

    page.on('request', (req: HTTPRequest) => {
      const url = req.url();
      const resourceType = req.resourceType();
      
      // Bloquear imágenes, fuentes, CSS para acelerar
      if (['image', 'stylesheet', 'font'].includes(resourceType)) {
        req.abort();
        return;
      }
      
      // Detectar m3u8 en requests
      if (/\.m3u8(\?|$)/i.test(url)) {
        addCandidate(url, 'request');
      }
      
      req.continue();
    });

    page.on('response', async (res: HTTPResponse) => {
      const url = res.url();
      if (/\.m3u8(\?|$)/i.test(url)) {
        addCandidate(url, 'response');
      }
    });
    
    // CLAVE: requestfinished captura las URLs finales
    page.on('requestfinished', (req: HTTPRequest) => {
      const url = req.url();
      if (/workers\.dev/i.test(url) || /\.m3u8(\?|$)/i.test(url)) {
        addCandidate(url, 'finished');
      }
    });

    await page.setExtraHTTPHeaders({ 
      Referer: sourceUrl, 
      Origin: new URL(sourceUrl).origin,
      'Accept-Language': 'es-419,es-US;q=0.9,es;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    });

    await page.goto(sourceUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    // Intentar clicks MÚLTIPLES VECES como en capture-111movies-puppeteer.mjs
    const selectors = [
      '.vjs-big-play-button',
      '.jw-icon-play',
      '#play',
      '[data-action="play"]',
      'button[aria-label="Play"]',
      'button[title="Play"]',
      'svg.play-icon-main',
    ];

    const tryClickInContext = async (ctx: any) => {
      try {
        for (const sel of selectors) {
          try {
            const handle = await ctx.$(sel);
            if (handle) {
              try { await handle.click({ delay: 10 }); } catch {}
              try {
                const box = await handle.boundingBox();
                if (box) {
                  await page!.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                }
              } catch {}
            }
          } catch {}
        }
        
        // Intentar con XPath para SVG play icon
        try {
          const [btn] = await ctx.$x("//button[.//svg[contains(@class,'play-icon-main')]]");
          if (btn) { try { await btn.click({ delay: 10 }); } catch {} }
        } catch {}
        
        // Intentar con evaluate
        try {
          await ctx.evaluate(() => {
            const el = document.querySelector('svg.play-icon-main');
            if (el) el.closest('button')?.click();
          });
        } catch {}
        
        // Intentar reproducir video directamente
        try {
          await ctx.evaluate(() => {
            const v = document.querySelector('video');
            if (v) {
              v.muted = true;
              v.play().catch(() => {});
            }
          });
        } catch {}
      } catch {}
    };

    // Clicks en página principal
    try { await tryClickInContext(page); } catch {}

    // Clicks en iframes
    const frames = page.frames();
    for (const frame of frames) {
      try { await tryClickInContext(frame); } catch {}
    }

    // Múltiples intentos con delays (como en el script)
    try { await tryClickInContext(page); } catch {}
    for (let i = 0; i < 6; i++) {
      try { await tryClickInContext(page); } catch {}
      await new Promise(r => setTimeout(r, 800));
    }
    
    // Esperar para que se disparen las requests
    await new Promise(r => setTimeout(r, 2000));

    // Último intento: buscar en __reqs y HTML
    if (!foundUrl) {
      console.log(`🔍 [VIDEASY] Buscando en __reqs...`);
      
      try {
        const reqs = await page.evaluate(() => (window as any).__reqs || []);
        console.log(`📋 [VIDEASY] Requests interceptadas: ${reqs.length}`);
        
        for (const req of reqs) {
          if (req.url && /\.m3u8(\?|$)/i.test(req.url)) {
            addCandidate(req.url, '__reqs');
          }
        }
      } catch (e) {
        console.log(`⚠️ [VIDEASY] Error leyendo __reqs:`, e);
      }
      
      // Si aún no se encontró, buscar en HTML
      if (!foundUrl && candidates.length === 0) {
        const html = await page.content();
        const matches = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/gi) || [];
        if (matches.length > 0) {
          for (const match of matches) {
            addCandidate(match, 'html');
          }
        }
      }
    }
    
    // Seleccionar el mejor candidato
    if (!foundUrl && candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      foundUrl = candidates[0].url;
      console.log(`✅ [VIDEASY] Mejor candidato seleccionado (score: ${candidates[0].score}): ${foundUrl.substring(0, 80)}...`);
    }

    if (foundUrl) {
      // 💾 Guardar en cache
      saveM3u8Cache(`videasy-${type}`, tmdbId, foundUrl, sourceUrl, season, episode).catch(() => {});

      console.log(`✅ [VIDEASY] Stream encontrado para ${type}/${tmdbId}${season ? `/s${season}e${episode}` : ''}: ${foundUrl}`);

      return NextResponse.json({ 
        streamUrl: foundUrl, 
        sourceUrl, 
        type, 
        id: tmdbId, 
        season, 
        episode,
        cached: false 
      });
    }

    console.log(`❌ [VIDEASY] No se encontró .m3u8 después de todos los intentos`);
    return NextResponse.json({ error: 'No se encontró .m3u8 en videasy', sourceUrl }, { status: 404 });
  } catch (error: any) {
    console.error(`❌ [VIDEASY] Error capturando stream:`, error?.message);
    return NextResponse.json({ error: 'Error capturando stream de videasy', message: error?.message }, { status: 500 });
  } finally {
    // 🔥 CRÍTICO: Cerrar SIEMPRE el browser para evitar leaks
    if (page) {
      try {
        await page.close();
        console.log('✅ [VIDEASY] Página cerrada');
      } catch (e) {
        console.error('❌ [VIDEASY] Error cerrando página:', e);
      }
    }
    if (browser) {
      try {
        await browser.close();
        console.log('✅ [VIDEASY] Browser cerrado');
      } catch (e) {
        console.error('❌ [VIDEASY] Error cerrando browser:', e);
      }
    }
  }
}

