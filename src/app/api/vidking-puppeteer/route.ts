import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { Browser, Page } from 'puppeteer';
import { getM3u8Cache, saveM3u8Cache, cleanExpiredCache } from '@/lib/m3u8-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, como Gecko) Chrome/142.0.0.0 Safari/537.36';

// Funciones copiadas del sandbox script
function decodeSegments(u: string): string[] {
  const out: string[] = [];
  try {
    const parts = new URL(u).pathname.split('/');
    for (const p of parts) {
      const raw = p.replace(/\.m3u8$/i, '');
      if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 8) {
        try {
          out.push(Buffer.from(decodeURIComponent(raw), 'base64').toString('utf8'));
        } catch {}
      }
    }
  } catch {}
  return out;
}

function isM3U8Like(u: string): boolean {
  if (/\.m3u8(\?|$)/i.test(u)) return true;
  const decs = decodeSegments(u);
  return decs.some(d => /\.m3u8(\?|$)/i.test(d) || /playlist\.m3u8/i.test(d));
}

function scoreUrl(u: string): number {
  let s = 0;
  if (/\.m3u8(\?|$)/i.test(u)) s += 100;
  const decs = decodeSegments(u);
  if (decs.some(d => /playlist\.m3u8/i.test(d))) s += 80;
  if (decs.some(d => /\.m3u8(\?|$)/i.test(d))) s += 60;
  if (decs.some(d => /index\.m3u8/i.test(d))) s -= 40;
  if (/\.mpd(\?|$)/i.test(u)) s += 40;
  if (/workers\.dev/i.test(u)) s += 10;
  if (/file2\//i.test(u)) s += 5;
  if (/\.html(\?|$)/i.test(u)) s -= 30;
  return s;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') || 'movie').toLowerCase();
  const tmdbId = searchParams.get('id');
  const season = searchParams.get('season') || undefined;
  const episode = searchParams.get('episode') || undefined;
  const skipCache = searchParams.get('skipCache') === 'true';

  if (!tmdbId) {
    return NextResponse.json({ error: 'Falta parámetro id (TMDB)' }, { status: 400 });
  }

  const cacheKey = `vidking-${type}-${tmdbId}${season ? `-s${season}e${episode}` : ''}`;

  // 🚀 PASO 1: Intentar obtener del cache
  if (!skipCache) {
    const cached = await getM3u8Cache(`vidking-${type}`, tmdbId, season, episode, false);
    if (cached) {
      const ageDays = ((Date.now() - cached.timestamp) / 1000 / 60 / 60 / 24).toFixed(1);
      console.log(`⚡ [VIDKING-CACHE-HIT] Usando m3u8 cacheado (${ageDays} días)`);
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

  if (Math.random() < 0.1) {
    cleanExpiredCache().catch(() => {});
  }

  const isTv = type === 'tv';
  const sourceUrl = isTv
    ? `https://www.vidking.net/embed/tv/${tmdbId}/${season ?? '1'}/${episode ?? '1'}`
    : `https://www.vidking.net/embed/movie/${tmdbId}`;

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`🚀 [VIDKING] Extrayendo m3u8 para ${sourceUrl}`);
    
    // ===== CÓDIGO COPIADO DIRECTAMENTE DEL SANDBOX =====
    browser = await puppeteer.launch({ 
      headless: true, 
      defaultViewport: null, 
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-quic', '--start-maximized'] 
    });
    
    page = await browser.newPage();
    await page.setUserAgent(UA);
    
    // Anti-detección (EXACTO DEL SANDBOX)
    await page.evaluateOnNewDocument(() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        (window as any).chrome = { runtime: {} };
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

    // Cerrar popups automáticamente (EXACTO DEL SANDBOX)
    browser.on('targetcreated', async (target) => {
      try {
        if (target.type() === 'page') {
          const turl = target.url();
          if (!/videasy\.net|workers\.dev|localhost|127\.0\.0\.1/i.test(turl)) {
            const tp = await target.page();
            if (tp) await tp.close();
          }
        }
      } catch {}
    });

    await page.setExtraHTTPHeaders({ 
      'Referer': sourceUrl, 
      'Origin': new URL(sourceUrl).origin 
    });

    let found: any = null;
    const candidates: Array<{ url: string; source: string; score: number }> = [];
    const seen = new Set<string>();
    let chosen: string | null = null;

    function addCandidate(u: string, source: string) {
      if (!u || seen.has(u)) return;
      seen.add(u);
      const score = scoreUrl(u);
      candidates.push({ url: u, source, score });
      console.log(`[VIDKING-${source}] ${u.substring(0, 80)}... | score=${score}`);
    }

    // Event listeners (EXACTOS DEL SANDBOX)
    page.on('request', (req) => {
      const url = req.url();
      if (/\.m3u8(\?|$)/i.test(url) || /\.mpd(\?|$)/i.test(url)) {
        found = { url, method: req.method() };
      }
    });

    page.on('response', async (res) => {
      const url = res.url();
      if (/\.m3u8(\?|$)/i.test(url) || /\.mpd(\?|$)/i.test(url)) {
        found = { url, status: res.status() };
      }
    });

    page.on('requestfinished', (req) => {
      const url = req.url();
      if (/workers\.dev/i.test(url) || /\.m3u8(\?|$)/i.test(url) || /\.mpd(\?|$)/i.test(url) || isM3U8Like(url)) {
        addCandidate(url, 'finished');
      }
    });
    
    console.log(`📍 [VIDKING] Navegando...`);
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded' });

    // Intentar click en el botón de play (EXACTO DEL SANDBOX)
    const selectors = [
      '.vjs-big-play-button',
      '.jw-icon-play',
      '#play',
      '[data-action="play"]',
      'button[aria-label="Play"]',
      'svg.play-icon-main',
    ];

    async function tryClickInContext(ctx: any) {
      try {
        for (const sel of selectors) {
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
        }
        try {
          const [btn] = await ctx.$x("//button[.//svg[contains(@class,'play-icon-main')]]");
          if (btn) { try { await btn.click({ delay: 10 }); } catch {} }
        } catch {}
        try { 
          await ctx.evaluate(() => { 
            const el = document.querySelector('svg.play-icon-main'); 
            if (el) el.closest('button')?.click(); 
          }); 
        } catch {}
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
    }

    try { await tryClickInContext(page); } catch {}

    // También intentar dentro de iframes
    const frames = page.frames();
    for (const frame of frames) {
      try { await tryClickInContext(frame); } catch {}
    }
    
    try { await tryClickInContext(page); } catch {}
    
    // Múltiples intentos con delays (EXACTO DEL SANDBOX)
    for (let i = 0; i < 6; i++) { 
      try { await tryClickInContext(page); } catch {} 
      await new Promise(r => setTimeout(r, 800)); 
    }

    // Esperar unos segundos para que disparen las requests
    await new Promise((r) => setTimeout(r, 2000));
    
    try {
      if (!found) {
        const reqs = await page.evaluate(() => ((window as any).__reqs || []).map((r: any) => r.url));
        const hit = reqs.find((u: string) => /\.m3u8(\?|$)/i.test(u));
        if (hit) found = { url: hit };
      }
    } catch {}

    if (candidates.length) {
      candidates.sort((a, b) => b.score - a.score);
      console.log('[VIDKING] Candidatos detectados:', candidates.length);
      for (const c of candidates) {
        console.log(`  - ${c.url.substring(0, 80)}... | fuente=${c.source} | score=${c.score}`);
      }
    }

    // Validar candidatos descargándolos (EXACTO DEL SANDBOX)
    chosen = chosen || null;
    for (const c of candidates) {
      try {
        const p2 = await browser.newPage();
        await p2.setUserAgent(UA);
        await p2.setExtraHTTPHeaders({ 'Referer': sourceUrl, 'Origin': new URL(sourceUrl).origin });
        const resp = await p2.goto(c.url, { waitUntil: 'domcontentloaded' });
        const hs = resp ? resp.headers() : {};
        const ct = (hs && (hs['content-type'] || hs['Content-Type'])) || '';
        const body = resp ? await resp.text() : '';
        await p2.close();
        if (/EXTM3U/i.test(body) || /mpegurl/i.test(ct)) { 
          chosen = c.url; 
          break; 
        }
      } catch {}
    }
    
    if (!chosen) {
      const best = candidates.length ? candidates[0] : null;
      chosen = (best && best.url) || (found && found.url);
    }

    if (!chosen) {
      console.log('❌ [VIDKING] No se encontró stream m3u8');
      return NextResponse.json(
        { error: 'No se encontró stream de vidking' },
        { status: 404 }
      );
    }

    // Guardar en cache
    try {
      await saveM3u8Cache(
        `vidking-${type}`,
        tmdbId,
        chosen,
        sourceUrl,
        season,
        episode
      );
      console.log(`💾 [VIDKING] M3u8 guardado en cache`);
    } catch (cacheError) {
      console.error('Error guardando cache:', cacheError);
    }

    console.log(`🎉 [VIDKING] Stream encontrado: ${chosen.substring(0, 100)}...`);

    return NextResponse.json({
      streamUrl: chosen,
      sourceUrl,
      type,
      id: tmdbId,
      season,
      episode,
      cached: false
    });

  } catch (error: any) {
    console.error('❌ [VIDKING] Error:', error);
    return NextResponse.json(
      { error: 'Error capturando stream de vidking', message: error.message },
      { status: 500 }
    );
  } finally {
    if (page) {
      try {
        await page.close();
        console.log('✅ [VIDKING] Página cerrada');
      } catch {}
    }
    if (browser) {
      try {
        await browser.close();
        console.log('✅ [VIDKING] Browser cerrado');
      } catch {}
    }
  }
}
