import { NextRequest, NextResponse } from 'next/server';
import { createSecureBrowser, setupAntiDetection } from '@/lib/secure-puppeteer';
import type { Page, HTTPRequest, HTTPResponse } from 'puppeteer';
// ✅ CACHE: Sistema de cache local de trailers
import { 
  getTrailerFromCache, 
  downloadAndCacheTrailer, 
  type TrailerCacheEntry 
} from '@/lib/trailer-downloader';

interface TrailerCandidate {
  href: string;
  page_url: string;
  label: string;
  duration_s: number;
  overlay_text: string;
}

interface GalleryResult {
  gallery_url: string;
  chosen: TrailerCandidate | null;
  candidates: TrailerCandidate[];
}

interface StreamResult {
  direct_url: string | null;
  kind: 'mp4' | 'm3u8' | 'unknown';
  headers: {
    'Referer': string;
    'User-Agent': string;
  };
  cookie_header: string | null;
  expires_epoch: number | null;
  expires_in_seconds: number | null;
}

// Cache simple en memoria (TTL: 1 hora)
const cache = new Map<string, { data: any; expires: number }>();

function parseDuration(text: string): number | null {
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  return minutes * 60 + seconds;
}

async function findBestTrailerFromGallery(
  imdbId: string,
  lang?: string,
  maxDurationS: number = 120,
  minDurationS: number = 25
): Promise<GalleryResult> {
  const origin = 'https://www.imdb.com';
  const galleryUrl = lang 
    ? `${origin}/${lang}/title/${imdbId}/videogallery/`
    : `${origin}/title/${imdbId}/videogallery/`;

  const titlePriority = [
    'official trailer',
    'season 1 trailer', 
    'tráiler oficial',
    'trailer oficial',
    'temporada 1'
  ];

  console.log(`[IMDB] Buscando trailers en: ${galleryUrl}`);

  const browser = await createSecureBrowser();
  const page = await browser.newPage();
  await setupAntiDetection(page);

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    
    await page.setViewport({ width: 1366, height: 768 });

    // Inyectar script para evitar detección
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
      Object.defineProperty(document, 'hidden', { get: () => false });
    });

    await page.goto(galleryUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });

    // Esperar a que carguen los overlays
    try {
      await page.waitForSelector('span.ipc-lockup-overlay__text', { timeout: 12000 });
    } catch (e) {
      console.log('[IMDB] No se encontraron overlays, continuando...');
    }

    // Extraer candidatos
    const items = await page.evaluate(() => {
      const spans = document.querySelectorAll('span.ipc-lockup-overlay__text.ipc-lockup-overlay__text--clamp-none');
      const out: Array<{ text: string; href: string | null; label: string }> = [];
      
      spans.forEach(span => {
        const text = (span.textContent || '').trim();
        const anchor = span.closest('a') || span.closest('.ipc-lockup-overlay')?.querySelector('a');
        const href = anchor?.getAttribute('href') || null;
        let label = anchor?.getAttribute('aria-label') || '';
        
        if (!label) {
          const lockup = span.closest('.ipc-lockup') || anchor?.closest('.ipc-lockup');
          const titleEl = lockup?.querySelector('.ipc-lockup-title, .ipc-lockup-title__text, h3, [data-testid="title"]');
          if (titleEl) label = (titleEl.textContent || '').trim();
        }
        
        out.push({ text, href, label });
      });
      
      return out;
    });

    console.log(`[IMDB] Encontrados ${items.length} videos en la galería`);

    // Filtrar y procesar candidatos
    const candidates: TrailerCandidate[] = [];
    
    for (const item of items) {
      const text = item.text.toLowerCase();
      if (!text.includes('trailer')) continue;
      
      const durationS = parseDuration(item.text);
      // Filtrar por duración mínima (25s) y máxima (120s)
      if (!durationS || durationS < minDurationS || durationS > maxDurationS) continue;
      
      const href = item.href;
      if (!href) continue;
      
      const fullUrl = href.startsWith('http') ? href : origin + href;
      
      candidates.push({
        href,
        page_url: fullUrl,
        label: item.label,
        duration_s: durationS,
        overlay_text: item.text
      });
    }

    console.log(`[IMDB] ${candidates.length} trailers válidos encontrados`);

    // Ordenar por prioridad
    const score = (c: TrailerCandidate) => {
      const lbl = c.label.toLowerCase();
      let s = 0;
      
      titlePriority.forEach((key, i) => {
        if (lbl.includes(key)) s += (100 - i);
      });
      
      // Bonificar trailers cortos
      const dur = c.duration_s;
      s += Math.max(0, 60 - Math.min(dur, 60));
      
      return s;
    };

    candidates.sort((a, b) => {
      const scoreA = score(a);
      const scoreB = score(b);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.duration_s - b.duration_s;
    });

    const chosen = candidates[0] || null;
    
    if (chosen) {
      console.log(`[IMDB] Elegido: "${chosen.label}" (${chosen.duration_s}s)`);
    }

    await browser.close();

    return {
      gallery_url: galleryUrl,
      chosen,
      candidates
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function extractVideoUrl(pageUrl: string, preferKind?: 'mp4' | 'm3u8'): Promise<StreamResult> {
  console.log(`[IMDB] Extrayendo stream de: ${pageUrl}`);

  const browser = await createSecureBrowser();
  const page = await browser.newPage();
  await setupAntiDetection(page);

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const result: StreamResult = {
    direct_url: null,
    kind: 'unknown',
    headers: {
      'Referer': pageUrl,
      'User-Agent': UA
    },
    cookie_header: null,
    expires_epoch: null,
    expires_in_seconds: null
  };

  const candidates: Array<{ url: string; kind: 'mp4' | 'm3u8' | 'unknown'; origin: string }> = [];
  const seenUrls = new Set<string>();

  const isStream = (url: string): 'mp4' | 'm3u8' | null => {
    const low = url.toLowerCase();
    if (low.includes('.m3u8')) return 'm3u8';
    if (low.includes('.mp4')) return 'mp4';
    return null;
  };

  try {
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1366, height: 768 });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
      Object.defineProperty(document, 'hidden', { get: () => false });
    });

    // Interceptar requests
    await page.setRequestInterception(true);
    page.on('request', (req: HTTPRequest) => {
      const url = req.url();
      const kind = isStream(url);
      if (kind && !seenUrls.has(url)) {
        seenUrls.add(url);
        candidates.push({ url, kind, origin: 'request' });
        console.log(`[IMDB] Request: ${kind} - ${url.substring(0, 80)}...`);
      }
      req.continue();
    });

    page.on('response', async (res: HTTPResponse) => {
      const url = res.url();
      const kind = isStream(url);
      if (kind && !seenUrls.has(url)) {
        seenUrls.add(url);
        candidates.push({ url, kind, origin: 'response' });
        console.log(`[IMDB] Response: ${kind} - ${url.substring(0, 80)}...`);
      }
    });

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });

    // Esperar a que cargue el video
    try {
      await page.waitForSelector('video.jw-video, .jwplayer, video', { timeout: 12000 });
    } catch (e) {
      console.log('[IMDB] No se encontró elemento video, continuando...');
    }

    // Intentar reproducir para forzar requests
    await page.evaluate(() => {
      const v = document.querySelector('video') as HTMLVideoElement;
      if (v) {
        v.muted = true;
        v.play().catch(() => {});
      }
      try {
        const jw = (window as any).jwplayer && (window as any).jwplayer();
        if (jw && jw.play) jw.play();
      } catch (e) {}
    });

    // Leer src del DOM
    const domSrc = await page.evaluate(() => {
      const el = document.querySelector('video.jw-video') || document.querySelector('video');
      return el?.getAttribute('src') || (el as HTMLVideoElement)?.src || null;
    });

    if (domSrc && !seenUrls.has(domSrc)) {
      const kind = isStream(domSrc);
      if (kind) {
        seenUrls.add(domSrc);
        candidates.push({ url: domSrc, kind, origin: 'dom' });
        console.log(`[IMDB] DOM src: ${kind} - ${domSrc.substring(0, 80)}...`);
      }
    }

    // Esperar un poco para capturar más requests
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Seleccionar el mejor candidato
    let chosen = null;
    if (preferKind) {
      chosen = candidates.find(c => c.kind === preferKind);
    }
    if (!chosen && candidates.length > 0) {
      chosen = candidates[0];
    }

    if (chosen) {
      result.direct_url = chosen.url;
      result.kind = chosen.kind;
      console.log(`[IMDB] Stream elegido: ${chosen.kind} desde ${chosen.origin}`);

      // Extraer expiración de la URL si está en query params
      try {
        const url = new URL(chosen.url);
        const expires = url.searchParams.get('Expires');
        if (expires) {
          const expiresEpoch = parseInt(expires);
          result.expires_epoch = expiresEpoch;
          result.expires_in_seconds = Math.max(0, expiresEpoch - Math.floor(Date.now() / 1000));
        }
      } catch (e) {}

      // Obtener cookies CloudFront si existen
      const cookies = await page.cookies();
      const cfCookies = cookies.filter((c: any) => 
        c.domain.includes('imdb-video.media-imdb.com') &&
        ['CloudFront-Key-Pair-Id', 'CloudFront-Signature', 'CloudFront-Policy'].includes(c.name)
      );
      
      if (cfCookies.length > 0) {
        result.cookie_header = cfCookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
        console.log(`[IMDB] Cookies CloudFront capturadas: ${cfCookies.length}`);
      }
    }

    await browser.close();
    return result;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const imdbId = searchParams.get('imdbId');

  if (!imdbId) {
    return NextResponse.json({ error: 'Falta parámetro: imdbId' }, { status: 400 });
  }

  const lang = searchParams.get('lang') || undefined;
  const prefer = searchParams.get('prefer') as 'mp4' | 'm3u8' | undefined;
  const maxDuration = parseInt(searchParams.get('maxDuration') || '120');
  const forceRefresh = searchParams.get('forceRefresh') === 'true';
  
  // ===========================================================================
  // PASO 0: Verificar si el trailer está en cache local (archivos)
  // ===========================================================================
  if (!forceRefresh) {
    console.log(`🔍 [IMDB-CACHE] Verificando cache para ${imdbId}...`);
    const cachedTrailer = await getTrailerFromCache(imdbId);
    
    if (cachedTrailer) {
      console.log(`✅ [IMDB-CACHE] Trailer encontrado en cache: ${cachedTrailer.filename}`);
      
      // Retornar el trailer cacheado
      return NextResponse.json({
        domain: 'imdb.com',
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
  
  // Verificar cache en memoria (legacy, por compatibilidad)
  const cacheKey = `${imdbId}-${lang || 'default'}-${prefer || 'any'}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now() && !forceRefresh) {
    console.log(`[IMDB] Cache en memoria hit para ${imdbId}`);
    return NextResponse.json(cached.data);
  }

  try {
    // 1. Buscar el mejor trailer en la videogallery
    const gallery = await findBestTrailerFromGallery(imdbId, lang, maxDuration);
    
    if (!gallery.chosen) {
      return NextResponse.json({ 
        error: 'No se encontró trailer en la videogallery',
        gallery_url: gallery.gallery_url
      }, { status: 404 });
    }

    // 2. Extraer la URL del stream
    const stream = await extractVideoUrl(gallery.chosen.page_url, prefer);

    if (!stream.direct_url) {
      return NextResponse.json({
        error: 'No se pudo extraer el stream del trailer',
        page_url: gallery.chosen.page_url
      }, { status: 404 });
    }

    // ===========================================================================
    // PASO 3: Descargar y cachear el trailer localmente
    // ===========================================================================
    console.log(`📥 [IMDB-CACHE] Intentando descargar y cachear trailer...`);
    
    let cachedEntry: TrailerCacheEntry | null = null;
    let downloadError: string | null = null;
    
    try {
      cachedEntry = await downloadAndCacheTrailer(imdbId, stream.direct_url, {
        format: stream.kind === 'mp4' || stream.kind === 'm3u8' ? stream.kind : 'mp4',
        title: gallery.chosen.label,
        duration: gallery.chosen.duration_s,
        headers: stream.headers,
        cookieHeader: stream.cookie_header,
        expiresEpoch: stream.expires_epoch
      });
      
      console.log(`✅ [IMDB-CACHE] Trailer cacheado exitosamente: ${cachedEntry.filename}`);
    } catch (error: any) {
      console.error(`❌ [IMDB-CACHE] Error cacheando trailer:`, error.message);
      downloadError = error.message;
      // Continuar y devolver la URL original si no se pudo cachear
    }

    // Si se cacheó exitosamente, devolver la URL local
    if (cachedEntry) {
      const response = {
        domain: 'imdb.com',
        page_url: gallery.chosen.page_url,
        stream_url: cachedEntry.filepath,
        kind: cachedEntry.format,
        headers: stream.headers,
        title: cachedEntry.title,
        duration_seconds: cachedEntry.duration,
        gallery_url: gallery.gallery_url,
        gallery_chosen: gallery.chosen,
        gallery_candidates: gallery.candidates,
        cached: true,
        cache_info: {
          downloadedAt: cachedEntry.downloadedAt,
          fileSize: cachedEntry.fileSize,
          filename: cachedEntry.filename
        }
      };

      // Cachear en memoria también (por compatibilidad)
      cache.set(cacheKey, {
        data: response,
        expires: Date.now() + 60 * 60 * 1000
      });

      console.log(`[IMDB] ✅ Stream obtenido y cacheado para ${imdbId}`);
      return NextResponse.json(response);
    }

    // Si no se pudo cachear, devolver la URL original (fallback)
    const response = {
      domain: 'imdb.com',
      page_url: gallery.chosen.page_url,
      stream_url: stream.direct_url,
      kind: stream.kind,
      headers: stream.headers,
      cookie_header: stream.cookie_header,
      expires_epoch: stream.expires_epoch,
      expires_in_seconds: stream.expires_in_seconds,
      title: gallery.chosen.label,
      duration_seconds: gallery.chosen.duration_s,
      gallery_url: gallery.gallery_url,
      gallery_chosen: gallery.chosen,
      gallery_candidates: gallery.candidates,
      cache_error: downloadError
    };

    // Cachear por 1 hora en memoria
    cache.set(cacheKey, {
      data: response,
      expires: Date.now() + 60 * 60 * 1000
    });

    console.log(`⚠️ [IMDB] Stream obtenido pero no cacheado para ${imdbId}`);
    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[IMDB] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Error al extraer trailer de IMDB'
    }, { status: 500 });
  }
}
