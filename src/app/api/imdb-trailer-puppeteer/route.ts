import { NextRequest, NextResponse } from 'next/server';
import type { Browser, Page, HTTPRequest, HTTPResponse } from 'puppeteer';
// ✅ SEGURIDAD: Usar configuración segura sin --no-sandbox
import { createSecureBrowser, createSecurePage, UA } from '@/lib/secure-puppeteer';
// ✅ CACHE: Sistema de cache local de trailers
import { 
  getTrailerFromCache, 
  downloadAndCacheTrailer, 
  type TrailerCacheEntry 
} from '@/lib/trailer-downloader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ✅ ELIMINADO: getBrowser() y browserInstance inseguros
// Ahora se usa createSecureBrowser() de secure-puppeteer.ts

interface TrailerCandidate {
  text: string;
  href: string;
  label: string;
  duration_s: number | null;
  page_url: string;
}

interface TrailerResult {
  stream_url: string;
  page_url: string;
  kind: 'mp4' | 'm3u8' | 'unknown';
  title?: string;
  duration_seconds?: number;
  headers?: Record<string, string>;
  cookie_header?: string | null;
  expires_epoch?: number | null;
  expires_in_seconds?: number | null;
  gallery_url?: string;
  gallery_chosen?: any;
}

function parseDurationSeconds(text: string): number | null {
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const mm = parseInt(match[1]);
  const ss = parseInt(match[2]);
  return mm * 60 + ss;
}

function isStreamUrl(url: string): 'mp4' | 'm3u8' | null {
  const low = url.toLowerCase();
  if (low.includes('.m3u8')) return 'm3u8';
  if (low.includes('.mp4') || low.includes('.m4v')) return 'mp4';
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imdbId = searchParams.get('imdbId');
  const lang = searchParams.get('lang') || null;
  const prefer = searchParams.get('prefer') || 'mp4';
  const maxDuration = parseInt(searchParams.get('maxDuration') || '240');
  const timeout = parseInt(searchParams.get('timeout') || '30');
  const forceRefresh = searchParams.get('forceRefresh') === 'true'; // Forzar descarga nueva

  if (!imdbId || !/^tt\d+$/.test(imdbId)) {
    return NextResponse.json({ error: 'IMDb ID inválido' }, { status: 400 });
  }

  // ===========================================================================
  // PASO 0: Verificar si el trailer está en cache
  // ===========================================================================
  if (!forceRefresh) {
    console.log(`🔍 [IMDB-CACHE] Verificando cache para ${imdbId}...`);
    const cachedTrailer = await getTrailerFromCache(imdbId);
    
    if (cachedTrailer) {
      console.log(`✅ [IMDB-CACHE] Trailer encontrado en cache: ${cachedTrailer.filename}`);
      
      // Retornar el trailer cacheado con el mismo formato que la API original
      return NextResponse.json({
        stream_url: cachedTrailer.filepath,
        page_url: cachedTrailer.filepath,
        kind: cachedTrailer.format,
        title: cachedTrailer.title,
        duration_seconds: cachedTrailer.duration,
        cached: true,
        cache_info: {
          downloadedAt: cachedTrailer.downloadedAt,
          fileSize: cachedTrailer.fileSize,
          filename: cachedTrailer.filename
        }
      });
    }
    
    console.log(`⚠️ [IMDB-CACHE] Trailer no encontrado en cache, ejecutando Puppeteer...`);
  } else {
    console.log(`🔄 [IMDB-CACHE] Forzando descarga nueva para ${imdbId}...`);
  }

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`🚀 [IMDB-SECURE] Iniciando browser SEGURO`);
    browser = await createSecureBrowser();
    page = await createSecurePage(browser);

    // ✅ Ya configurado por createSecurePage(): viewport, UA, headers, anti-detección

    // Script adicional para prevenir pausado por visibilidad
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
      Object.defineProperty(document, 'hidden', { get: () => false });
    });

    // ===========================================================================
    // PASO 1: Ir a videogallery y buscar el mejor trailer
    // ===========================================================================
    
    const origin = 'https://www.imdb.com';
    const galleryUrl = lang 
      ? `${origin}/${lang}/title/${imdbId}/videogallery/`
      : `${origin}/title/${imdbId}/videogallery/`;

    console.log('📡 [IMDB] Navegando a videogallery:', galleryUrl);

    await page.goto(galleryUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 40000 
    });

    // Esperar a que aparezcan los overlays
    try {
      await page.waitForSelector('span.ipc-lockup-overlay__text.ipc-lockup-overlay__text--clamp-none', { 
        timeout: 12000 
      });
    } catch {
      console.log('⚠️ [IMDB] No se encontró overlay de lockup, intentando alternativa...');
    }

    // Extraer candidatos (exactamente como en el Python)
    const items = await page.evaluate(() => {
      const spans = document.querySelectorAll('span.ipc-lockup-overlay__text.ipc-lockup-overlay__text--clamp-none');
      const out: Array<{ text: string; href: string | null; label: string }> = [];
      
      spans.forEach(span => {
        const text = (span.textContent || '').trim();
        
        // Buscar el anchor asociado al overlay
        let anchor = span.closest('a');
        if (!anchor) {
          const overlay = span.closest('.ipc-lockup-overlay');
          anchor = overlay?.querySelector('a') || null;
        }
        
        const href = anchor ? anchor.getAttribute('href') : null;
        
        let label = '';
        if (anchor) {
          label = anchor.getAttribute('aria-label') || '';
        }
        
        if (!label) {
          let lockup = span.closest('.ipc-lockup');
          if (!lockup && anchor) {
            lockup = anchor.closest('.ipc-lockup');
          }
          if (!lockup) {
            lockup = span.closest('[data-testid="lockup"]');
          }
          
          if (lockup) {
            const titleEl = lockup.querySelector('.ipc-lockup-title, .ipc-lockup-title__text, h3, [data-testid="title"]');
            if (titleEl) {
              label = (titleEl.textContent || '').trim();
            }
          }
        }
        
        out.push({ text, href, label });
      });
      
      return out;
    });

    console.log(`🔍 [IMDB] Encontrados ${items.length} elementos con overlay`);

    // Filtrar y procesar candidatos
    const candidates: TrailerCandidate[] = [];
    
    for (const item of items) {
      const txtLower = item.text.toLowerCase();
      if (!txtLower.includes('trailer')) continue;
      
      const duration_s = parseDurationSeconds(item.text);
      if (duration_s === null) continue;
      if (duration_s > maxDuration) continue;
      if (!item.href) continue;
      
      const full_url = item.href.startsWith('http') 
        ? item.href 
        : `${origin}${item.href.startsWith('/') ? '' : '/'}${item.href}`;
      
      candidates.push({
        text: item.text,
        href: item.href,
        label: item.label,
        duration_s,
        page_url: full_url
      });
    }

    console.log(`✅ [IMDB] ${candidates.length} trailers válidos encontrados`);

    if (candidates.length === 0) {
      await page.close();
      return NextResponse.json({ 
        error: 'No se encontraron trailers',
        gallery_url: galleryUrl,
        imdbId 
      }, { status: 404 });
    }

    // Priorizar por títulos (como en Python)
    const titlePriority = [
      'official trailer', 'season 1 trailer', 'tráiler oficial', 
      'trailer oficial', 'temporada 1'
    ];

    const scoreCandidate = (c: TrailerCandidate) => {
      const lbl = c.label.toLowerCase();
      let score = 0;
      
      titlePriority.forEach((key, i) => {
        if (lbl.includes(key)) {
          score += (100 - i);
        }
      });
      
      // Bonificar cortos (<60s)
      if (c.duration_s && c.duration_s < 60) {
        score += Math.max(0, 60 - Math.min(c.duration_s, 60));
      }
      
      return score;
    };

    candidates.sort((a, b) => {
      const scoreA = scoreCandidate(a);
      const scoreB = scoreCandidate(b);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return (a.duration_s || 9999) - (b.duration_s || 9999);
    });

    const chosen = candidates[0];
    console.log(`🎯 [IMDB] Elegido: "${chosen.label}" (${chosen.duration_s}s)`);
    console.log(`📡 [IMDB] URL: ${chosen.page_url}`);

    // ===========================================================================
    // PASO 2: Navegar a la página del video y extraer el stream
    // ===========================================================================

    const foundVideos: Array<{ url: string; kind: 'mp4' | 'm3u8' }> = [];
    const seenUrls = new Set<string>();

    // Sniffer de red
    const onRequest = (req: HTTPRequest) => {
      const url = req.url();
      const kind = isStreamUrl(url);
      if (kind && !seenUrls.has(url)) {
        console.log(`🎥 [IMDB] Request capturado (${kind}):`, url.substring(0, 80));
        seenUrls.add(url);
        foundVideos.push({ url, kind });
      }
    };

    const onResponse = (res: HTTPResponse) => {
      const url = res.url();
      const kind = isStreamUrl(url);
      if (kind && !seenUrls.has(url)) {
        console.log(`🎥 [IMDB] Response capturado (${kind}):`, url.substring(0, 80));
        seenUrls.add(url);
        foundVideos.push({ url, kind });
      }
    };

    page.on('request', onRequest);
    page.on('response', onResponse);

    await page.goto(chosen.page_url, { 
      waitUntil: 'domcontentloaded',
      timeout: 40000 
    });

    // Esperar a que aparezca el video
    try {
      await page.waitForSelector('video.jw-video, .jwplayer, rt-media-player, video', { 
        timeout: 12000 
      });
    } catch {
      console.log('⚠️ [IMDB] No se encontró video tag inmediatamente');
    }

    // Disparar reproducción (como en Python)
    try {
      await page.evaluate(() => {
        const v = document.querySelector('video') as HTMLVideoElement;
        if (v) {
          v.muted = true;
          v.play().catch(() => {});
        }
        
        // Intentar JWPlayer
        try {
          const jw = (window as any).jwplayer && (window as any).jwplayer();
          if (jw && jw.play) {
            jw.play();
          }
        } catch (e) {}
        
        // Simular click
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    } catch (e) {
      console.log('⚠️ [IMDB] Error al reproducir:', e);
    }

    // Intentar obtener src del DOM
    let domSrc: string | null = null;
    try {
      domSrc = await page.evaluate(() => {
        const el = document.querySelector('video.jw-video') || document.querySelector('video');
        if (!el) return null;
        return el.getAttribute('src') || (el as HTMLVideoElement).src || null;
      });
      
      if (domSrc) {
        domSrc = domSrc.replace(/&amp;/g, '&'); // HTML decode
        const kind = isStreamUrl(domSrc);
        if (kind && !seenUrls.has(domSrc)) {
          console.log(`🎥 [IMDB] DOM src capturado (${kind})`);
          seenUrls.add(domSrc);
          foundVideos.push({ url: domSrc, kind });
        }
      }
    } catch (e) {
      console.log('⚠️ [IMDB] Error al leer DOM src:', e);
    }

    // Intentar JWPlayer API
    try {
      const jwFile = await page.evaluate(() => {
        try {
          const jw = (window as any).jwplayer && (window as any).jwplayer();
          if (jw && jw.getPlaylistItem) {
            const item = jw.getPlaylistItem();
            if (item && item.file) {
              return item.file;
            }
          }
        } catch (e) {}
        return null;
      });
      
      if (jwFile) {
        const jwFileDecoded = jwFile.replace(/&amp;/g, '&');
        const kind = isStreamUrl(jwFileDecoded);
        if (kind && !seenUrls.has(jwFileDecoded)) {
          console.log(`🎥 [IMDB] JWPlayer API capturado (${kind})`);
          seenUrls.add(jwFileDecoded);
          foundVideos.push({ url: jwFileDecoded, kind });
        }
      }
    } catch (e) {
      console.log('⚠️ [IMDB] Error al leer JWPlayer API:', e);
    }

    // Esperar un poco para capturar requests
    const startWait = Date.now();
    const maxWait = timeout * 1000;
    
    while (Date.now() - startWait < maxWait) {
      // Si ya tenemos el tipo preferido, salir
      if (foundVideos.some(v => v.kind === prefer)) {
        break;
      }
      // Si no hay preferencia y ya tenemos algo, salir rápido
      if (foundVideos.length > 0) {
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`📊 [IMDB] Total videos capturados: ${foundVideos.length}`);

    // Seleccionar según preferencia
    let selectedVideo = foundVideos.find(v => v.kind === prefer) || foundVideos[0];

    if (!selectedVideo) {
      await page.close();
      return NextResponse.json({ 
        error: 'No se pudo capturar stream de la página de video',
        page_url: chosen.page_url,
        imdbId 
      }, { status: 404 });
    }

    // Obtener cookies de CloudFront si existen
    let cookieHeader: string | null = null;
    try {
      const cookies = await page.cookies();
      const cfCookies: Record<string, string> = {};
      
      for (const cookie of cookies) {
        if (cookie.domain.includes('imdb-video') || cookie.domain.includes('media-amazon')) {
          if (['CloudFront-Key-Pair-Id', 'CloudFront-Signature', 'CloudFront-Policy'].includes(cookie.name)) {
            cfCookies[cookie.name] = cookie.value;
          }
        }
      }
      
      if (Object.keys(cfCookies).length > 0) {
        cookieHeader = Object.entries(cfCookies).map(([k, v]) => `${k}=${v}`).join('; ');
        console.log('🍪 [IMDB] CloudFront cookies encontradas');
      }
    } catch (e) {
      console.log('⚠️ [IMDB] Error al obtener cookies:', e);
    }

    // Parsear expiración de la URL si existe
    let expiresEpoch: number | null = null;
    let expiresInSeconds: number | null = null;
    
    try {
      const url = new URL(selectedVideo.url);
      const expiresParam = url.searchParams.get('Expires');
      if (expiresParam) {
        expiresEpoch = parseInt(expiresParam);
        expiresInSeconds = Math.max(0, expiresEpoch - Math.floor(Date.now() / 1000));
      }
    } catch {}

    await page.close();

    // ===========================================================================
    // PASO 3: Descargar y cachear el trailer localmente
    // ===========================================================================
    console.log(`📥 [IMDB-CACHE] Intentando descargar y cachear trailer...`);
    
    let cachedEntry: TrailerCacheEntry | null = null;
    let downloadError: string | null = null;
    
    try {
      cachedEntry = await downloadAndCacheTrailer(imdbId, selectedVideo.url, {
        format: selectedVideo.kind,
        title: chosen.label,
        duration: chosen.duration_s || undefined,
        headers: {
          'Referer': chosen.page_url,
          'User-Agent': UA
        },
        cookieHeader,
        expiresEpoch
      });
      
      console.log(`✅ [IMDB-CACHE] Trailer cacheado exitosamente: ${cachedEntry.filename}`);
    } catch (error: any) {
      console.error(`❌ [IMDB-CACHE] Error cacheando trailer:`, error.message);
      downloadError = error.message;
      // Continuar y devolver la URL original si no se pudo cachear
    }

    // Si se cacheó exitosamente, devolver la URL local
    if (cachedEntry) {
      return NextResponse.json({
        stream_url: cachedEntry.filepath,
        page_url: chosen.page_url,
        kind: cachedEntry.format,
        title: cachedEntry.title,
        duration_seconds: cachedEntry.duration,
        cached: true,
        cache_info: {
          downloadedAt: cachedEntry.downloadedAt,
          fileSize: cachedEntry.fileSize,
          filename: cachedEntry.filename
        },
        gallery_url: galleryUrl,
        gallery_chosen: {
          label: chosen.label,
          duration_s: chosen.duration_s,
          href: chosen.href
        }
      });
    }

    // Si no se pudo cachear, devolver la URL original (fallback)
    const result: TrailerResult = {
      stream_url: selectedVideo.url,
      page_url: chosen.page_url,
      kind: selectedVideo.kind,
      title: chosen.label,
      duration_seconds: chosen.duration_s || undefined,
      headers: {
        'Referer': chosen.page_url,
        'User-Agent': UA
      },
      cookie_header: cookieHeader,
      expires_epoch: expiresEpoch,
      expires_in_seconds: expiresInSeconds,
      gallery_url: galleryUrl,
      gallery_chosen: {
        label: chosen.label,
        duration_s: chosen.duration_s,
        href: chosen.href
      }
    };

    console.log('⚠️ [IMDB] Stream no cacheado, devolviendo URL original:', {
      kind: result.kind,
      duration: result.duration_seconds,
      hasCookies: !!cookieHeader,
      expires: expiresInSeconds,
      downloadError
    });

    return NextResponse.json({ ...result, cache_error: downloadError });

  } catch (error: any) {
    if (page) { try { await page.close(); } catch {} }
    console.error('❌ [IMDB] Error:', error);
    return NextResponse.json({ 
      error: 'Error obteniendo trailer',
      message: error?.message,
      imdbId 
    }, { status: 500 });
  }
}
