import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { Browser, Page } from 'puppeteer';
import { getM3u8Cache, saveM3u8Cache, cleanExpiredCache } from '@/lib/m3u8-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

// Detectar idioma del subtítulo (COPIADO DEL SANDBOX)
function detectLanguage(url: string): { code: string; name: string } {
  const filename = url.split('/').pop()?.split('?')[0].toLowerCase() || '';
  
  const langMap: Record<string, string> = {
    'eng': 'English', 'spa': 'Spanish', 'fre': 'French', 'fra': 'French',
    'ger': 'German', 'deu': 'German', 'ita': 'Italian', 'por': 'Portuguese',
    'jpn': 'Japanese', 'kor': 'Korean', 'chi': 'Chinese', 'zho': 'Chinese',
    'ara': 'Arabic', 'rus': 'Russian', 'hin': 'Hindi',
    'dut': 'Dutch', 'nld': 'Dutch', 'pol': 'Polish', 'tur': 'Turkish',
    'swe': 'Swedish', 'nor': 'Norwegian', 'dan': 'Danish', 'fin': 'Finnish',
    'gre': 'Greek', 'ell': 'Greek', 'hun': 'Hungarian',
    'cze': 'Czech', 'ces': 'Czech', 'slv': 'Slovenian',
    'slo': 'Slovak', 'slk': 'Slovak', 'srp': 'Serbian', 'hrv': 'Croatian',
    'bul': 'Bulgarian', 'rum': 'Romanian', 'ron': 'Romanian',
    'ukr': 'Ukrainian', 'lit': 'Lithuanian', 'lav': 'Latvian',
    'est': 'Estonian', 'ice': 'Icelandic', 'isl': 'Icelandic',
    'mac': 'Macedonian', 'mkd': 'Macedonian', 'alb': 'Albanian', 'sqi': 'Albanian',
    'vie': 'Vietnamese', 'tha': 'Thai', 'ind': 'Indonesian',
    'may': 'Malay', 'msa': 'Malay', 'heb': 'Hebrew', 'per': 'Persian', 'fas': 'Persian'
  };
  
  const match = filename.match(/([a-z]{3})-\d+\.vtt$/);
  if (match) {
    const code = match[1];
    const name = langMap[code];
    if (name) return { code, name };
  }
  
  for (const [code, name] of Object.entries(langMap)) {
    const pattern = new RegExp(`[._-]${code}[._-]|^${code}[._-]|[._-]${code}\\.vtt`, 'i');
    if (pattern.test(filename)) {
      return { code, name };
    }
  }
  
  return { code: 'unknown', name: 'Unknown' };
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

  const cacheKey = `vidlink-${type}-${tmdbId}${season ? `-s${season}e${episode}` : ''}`;

  // 🚀 PASO 1: Intentar obtener del cache
  if (!skipCache) {
    const cached = await getM3u8Cache(`vidlink-${type}`, tmdbId, season, episode, false);
    if (cached) {
      const ageDays = ((Date.now() - cached.timestamp) / 1000 / 60 / 60 / 24).toFixed(1);
      
      // 🚫 CACHÉ NEGATIVO: Este contenido no está disponible en Vidlink
      if (cached.streamUrl === 'NOT_AVAILABLE') {
        console.log(`⚠️ [VIDLINK-CACHE-NEGATIVE] Contenido marcado como no disponible (${ageDays} días)`);
        return NextResponse.json(
          { error: 'Content not available on Vidlink (cached)' },
          { status: 404 }
        );
      }
      
      console.log(`⚡ [VIDLINK-CACHE-HIT] Usando m3u8 cacheado (${ageDays} días)`);
      
      // 🚀 PASO 1.5: Verificar si el M3U8 cacheado aún funciona (fetch directo)
      try {
        const testStart = Date.now();
        const testResponse = await fetch(cached.streamUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': UA,
            'Referer': 'https://vidlink.pro/',
            'Origin': 'https://vidlink.pro',
            'Accept': '*/*'
          },
          signal: AbortSignal.timeout(3000) // Timeout de 3s
        });
        
        const testTime = Date.now() - testStart;
        
        if (testResponse.ok) {
          console.log(`⚡ [VIDLINK-CACHE-VERIFIED] M3U8 aún funciona (${testTime}ms)`);
          return NextResponse.json({
            streamUrl: cached.streamUrl,
            sourceUrl: cached.sourceUrl,
            type: cached.type,
            id: cached.id,
            season: cached.season,
            episode: cached.episode,
            subtitles: cached.subtitles || [],
            cached: true,
            cacheAgeDays: parseFloat(ageDays),
            verifiedMs: testTime
          });
        } else {
          console.log(`⚠️ [VIDLINK-CACHE-EXPIRED] M3U8 expirado (HTTP ${testResponse.status}), obteniendo nuevo...`);
        }
      } catch (testError) {
        console.log(`⚠️ [VIDLINK-CACHE-ERROR] Error verificando cache, obteniendo nuevo...`);
      }
    }
  }

  if (Math.random() < 0.1) {
    cleanExpiredCache().catch(() => {});
  }

  const isTv = type === 'tv';
  let baseUrl = isTv
    ? `https://vidlink.pro/tv/${tmdbId}/${season ?? '1'}/${episode ?? '1'}`
    : `https://vidlink.pro/movie/${tmdbId}`;
  
  const optimizedUrl = new URL(baseUrl);
  optimizedUrl.searchParams.set('primaryColor', '63b8bc');
  optimizedUrl.searchParams.set('secondaryColor', 'a2a2a2');
  optimizedUrl.searchParams.set('iconColor', 'eefdec');
  optimizedUrl.searchParams.set('icons', 'default');
  optimizedUrl.searchParams.set('player', 'jw');
  optimizedUrl.searchParams.set('title', 'false');
  optimizedUrl.searchParams.set('poster', 'false');
  optimizedUrl.searchParams.set('autoplay', 'false');
  optimizedUrl.searchParams.set('nextbutton', 'false');
  const sourceUrl = optimizedUrl.toString();

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    const puppeteerStart = Date.now();
    console.log(`🚀 [VIDLINK] Extrayendo m3u8 para ${sourceUrl}`);
    
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    page = await browser.newPage();
    await page.setUserAgent(UA);
    
    // Anti-detección
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      (window as any).chrome = { runtime: {} };
    });

    // Cerrar popups
    browser.on('targetcreated', async (target) => {
      try {
        if (target.type() === 'page') {
          const turl = target.url();
          if (!/vidlink\.pro|megafiles\.store|workers\.dev/i.test(turl)) {
            const tp = await target.page();
            if (tp) await tp.close();
          }
        }
      } catch {}
    });

    let foundM3u8: string | null = null;
    const candidates: Array<{ url: string; score: number; timestamp: number }> = [];
    const subtitles: Array<{ url: string; lang: { code: string; name: string } }> = [];

    function scoreUrl(u: string) {
      let s = 0;
      if (/\.m3u8(\?|$)/i.test(u)) s += 100;
      if (/playlist\.m3u8/i.test(u)) s += 50;
      if (/master\.m3u8/i.test(u)) s += 50;
      if (/workers\.dev/i.test(u)) s += 30;
      if (/cloudflare/i.test(u)) s += 20;
      if (/index\.m3u8/i.test(u)) s -= 20;
      return s;
    }

    // 🚀 ACTIVAR REQUEST INTERCEPTION (la clave de la velocidad)
    await page.setRequestInterception(true);
    
    page.on('request', (req) => {
      const url = req.url();
      
      // Capturar M3U8
      if (/\.m3u8/i.test(url)) {
        const score = scoreUrl(url);
        
        if (!candidates.some(c => c.url === url)) {
          candidates.push({
            url,
            score,
            timestamp: Date.now()
          });
          
          console.log(`[M3U8-REQUEST] ${url.substring(0, 80)}... (score: ${score})`);
          
          // Si encontramos un master/playlist, marcarlo inmediatamente
          if (score >= 150 && !foundM3u8) {
            foundM3u8 = url;
            console.log('✅ [VIDLINK] Master M3U8 detectado en request!');
          }
        }
      }
      
      // Capturar subtítulos
      if (/\.vtt(\?|$)/i.test(url)) {
        if (!subtitles.some(s => s.url === url)) {
          const lang = detectLanguage(url);
          subtitles.push({ url, lang });
          console.log(`[VTT-REQUEST] ${lang.name} - ${url.substring(0, 60)}...`);
        }
      }
      
      // IMPORTANTE: Continuar la request
      req.continue().catch(() => {});
    });

    // También escuchar responses por si acaso
    page.on('response', async (res) => {
      const url = res.url();
      
      if (/\.m3u8/i.test(url)) {
        const score = scoreUrl(url);
        if (score >= 150 && !foundM3u8) {
          foundM3u8 = url;
          console.log(`[M3U8-RESPONSE] Master confirmado: ${url.substring(0, 80)}...`);
        }
      }
    });

    console.log(`📍 [VIDLINK] Navegando...`);
    
    try {
      await page.goto(sourceUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });
    } catch (e) {
      // Puede fallar el timeout pero si ya tenemos M3U8 está bien
    }

    // Esperar SOLO 1 segundo
    await new Promise(r => setTimeout(r, 1000));

    // Si ya tenemos M3U8, cerrar inmediatamente
    if (foundM3u8) {
      const puppeteerTime = Date.now() - puppeteerStart;
      console.log(`🎉 [VIDLINK] M3U8 capturado en ${puppeteerTime}ms`);
    } else if (candidates.length > 0) {
      // Seleccionar el mejor candidato
      candidates.sort((a, b) => b.score - a.score);
      foundM3u8 = candidates[0].url;
      const puppeteerTime = Date.now() - puppeteerStart;
      console.log(`✅ [VIDLINK] Mejor candidato seleccionado en ${puppeteerTime}ms`);
    } else {
      // Último intento: esperar un poco más
      console.log('🔍 [VIDLINK] Buscando M3U8...');
      await new Promise(r => setTimeout(r, 1500));
      
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        foundM3u8 = candidates[0].url;
      }
    }

    const totalPuppeteerTime = Date.now() - puppeteerStart;

    if (!foundM3u8) {
      console.log(`❌ [VIDLINK] No se encontró stream m3u8 (${totalPuppeteerTime}ms)`);
      
      // 💾 GUARDAR CACHÉ NEGATIVO (7 días) para no reintentar
      try {
        await saveM3u8Cache(
          `vidlink-${type}`,
          tmdbId,
          'NOT_AVAILABLE', // URL especial para indicar no disponible
          sourceUrl,
          season,
          episode,
          7 * 24 * 60 * 60 * 1000, // 7 días
          []
        );
        console.log(`💾 [VIDLINK-CACHE-NEGATIVE] Contenido marcado como no disponible (7 días)`);
      } catch (cacheError) {
        console.error('Error guardando caché negativo:', cacheError);
      }
      
      return NextResponse.json(
        { error: 'No se encontró stream de vidlink' },
        { status: 404 }
      );
    }

    // Guardar en cache
    try {
      const subtitlesForCache = subtitles.map(sub => ({
        url: sub.url,
        language: sub.lang.code,
        label: sub.lang.name
      }));
      
      await saveM3u8Cache(
        `vidlink-${type}`,
        tmdbId,
        foundM3u8,
        sourceUrl,
        season,
        episode,
        undefined,
        subtitlesForCache
      );
      console.log(`💾 [VIDLINK] M3u8 guardado en cache con ${subtitlesForCache.length} subtítulos`);
    } catch (cacheError) {
      console.error('Error guardando cache:', cacheError);
    }

    console.log(`🎉 [VIDLINK] Stream encontrado: ${foundM3u8.substring(0, 100)}...`);
    console.log(`⏱️  [VIDLINK] Tiempo total de Puppeteer: ${totalPuppeteerTime}ms`);

    return NextResponse.json({
      streamUrl: foundM3u8,
      sourceUrl,
      type,
      id: tmdbId,
      season,
      episode,
      subtitles: subtitles.map(sub => ({
        url: sub.url,
        language: sub.lang.code,
        label: sub.lang.name
      })),
      cached: false,
      puppeteerTimeMs: totalPuppeteerTime
    });

  } catch (error: any) {
    console.error('❌ [VIDLINK] Error:', error);
    return NextResponse.json(
      { error: 'Error capturando stream de vidlink', message: error.message },
      { status: 500 }
    );
  } finally {
    if (page) {
      try {
        await page.close();
        console.log('✅ [VIDLINK] Página cerrada');
      } catch {}
    }
    if (browser) {
      try {
        await browser.close();
        console.log('✅ [VIDLINK] Browser cerrado');
      } catch {}
    }
  }
}
