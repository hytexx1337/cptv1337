import { NextRequest, NextResponse } from 'next/server';
import { startSession, startSessionFromCache } from '@/lib/hlsBrowserProxy';
import { getM3u8Cache, saveM3u8Cache } from '@/lib/m3u8-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') || 'movie').toLowerCase();
  const id = searchParams.get('id');
  const season = searchParams.get('season') || undefined;
  const episode = searchParams.get('episode') || undefined;

  if (!id) {
    return NextResponse.json({ error: 'Falta parámetro id' }, { status: 400 });
  }

  try {
    let sess;
    let tmdbId: string | null = null;
    
    // 🔄 Convertir IMDB a TMDB si es necesario (para videasy/vidking)
    if (id.startsWith('tt')) {
      const tmdbApiKey = process.env.TMDB_API_KEY;
      if (tmdbApiKey) {
        try {
          const findUrl = `https://api.themoviedb.org/3/find/${id}?api_key=${tmdbApiKey}&external_source=imdb_id`;
          const findRes = await fetch(findUrl);
          const findData = await findRes.json();
          
          if (type === 'tv' && findData.tv_results?.length > 0) {
            tmdbId = findData.tv_results[0].id.toString();
          } else if (type === 'movie' && findData.movie_results?.length > 0) {
            tmdbId = findData.movie_results[0].id.toString();
          }
        } catch (e) {
          console.log(`⚠️ [TMDB] Error convirtiendo IMDB a TMDB:`, e);
        }
      }
    }
    
    // 🚀 PASO 1: Buscar en cache de VIDLINK primero
    if (tmdbId) {
      const cachedVidlink = await getM3u8Cache(`vidlink-${type}`, tmdbId, season, episode, false);
      if (cachedVidlink) {
        const ageDays = ((Date.now() - cachedVidlink.timestamp) / 1000 / 60 / 60 / 24).toFixed(1);
        console.log(`⚡ [VIDLINK-CACHE-HIT] Usando m3u8 cacheado (${ageDays} días): ${cachedVidlink.streamUrl.substring(0, 60)}...`);
        
        // Reescribir URLs de subtítulos si existen
        const subtitles = cachedVidlink.subtitles?.map((sub: any) => ({
          ...sub,
          url: sub.url.startsWith('http') 
            ? `/api/subtitles/vidlink-proxy?url=${encodeURIComponent(sub.url)}`
            : sub.url
        })) || [];
        
        if (subtitles.length > 0) {
          console.log(`📝 [VIDLINK-CACHE] ${subtitles.length} subtítulos restaurados del caché`);
        }
        
        sess = startSessionFromCache(cachedVidlink.streamUrl, type, id, season, episode, cachedVidlink.sourceUrl);
        
        const playlistUrl = `/api/hls-browser-proxy/m3u8?sid=${encodeURIComponent(sess.id)}`;
        return NextResponse.json({ 
          ok: true, 
          sid: sess.id, 
          playlistUrl,
          cached: true,
          source: 'vidlink-cache',
          subtitles // Devolver subtítulos del caché
        });
      }
    }
    
    // 🚀 PASO 2: Buscar en cache de VIDEASY
    if (tmdbId) {
      const cachedVideasy = await getM3u8Cache(`videasy-${type}`, tmdbId, season, episode, false);
      if (cachedVideasy) {
        const ageDays = ((Date.now() - cachedVideasy.timestamp) / 1000 / 60 / 60 / 24).toFixed(1);
        console.log(`⚡ [VIDEASY-CACHE-HIT] Usando m3u8 cacheado (${ageDays} días): ${cachedVideasy.streamUrl.substring(0, 60)}...`);
        
        // Reescribir URLs de subtítulos si existen
        const subtitles = cachedVideasy.subtitles?.map((sub: any) => ({
          ...sub,
          url: sub.url.startsWith('http') 
            ? `/api/subtitles/vidlink-proxy?url=${encodeURIComponent(sub.url)}`
            : sub.url
        })) || [];
        
        if (subtitles.length > 0) {
          console.log(`📝 [VIDEASY-CACHE] ${subtitles.length} subtítulos restaurados del caché`);
        }
        
        sess = startSessionFromCache(cachedVideasy.streamUrl, type, id, season, episode, cachedVideasy.sourceUrl);
        
        const playlistUrl = `/api/hls-browser-proxy/m3u8?sid=${encodeURIComponent(sess.id)}`;
        return NextResponse.json({ 
          ok: true, 
          sid: sess.id, 
          playlistUrl,
          cached: true,
          source: 'videasy-cache',
          subtitles // Devolver subtítulos del caché
        });
      }
    }
    
    // 🚀 PASO 3: Buscar en cache de VIDKING
    if (tmdbId) {
      const cachedVidking = await getM3u8Cache(`vidking-${type}`, tmdbId, season, episode, false);
      if (cachedVidking) {
        const ageDays = ((Date.now() - cachedVidking.timestamp) / 1000 / 60 / 60 / 24).toFixed(1);
        console.log(`⚡ [VIDKING-CACHE-HIT] Usando m3u8 cacheado (${ageDays} días): ${cachedVidking.streamUrl.substring(0, 60)}...`);
        
        // Reescribir URLs de subtítulos si existen
        const subtitles = cachedVidking.subtitles?.map((sub: any) => ({
          ...sub,
          url: sub.url.startsWith('http') 
            ? `/api/subtitles/vidlink-proxy?url=${encodeURIComponent(sub.url)}`
            : sub.url
        })) || [];
        
        if (subtitles.length > 0) {
          console.log(`📝 [VIDKING-CACHE] ${subtitles.length} subtítulos restaurados del caché`);
        }
        
        sess = startSessionFromCache(cachedVidking.streamUrl, type, id, season, episode, cachedVidking.sourceUrl);
        
        const playlistUrl = `/api/hls-browser-proxy/m3u8?sid=${encodeURIComponent(sess.id)}`;
        return NextResponse.json({ 
          ok: true, 
          sid: sess.id, 
          playlistUrl,
          cached: true,
          source: 'vidking-cache',
          subtitles // Devolver subtítulos del caché
        });
      }
    }
    
    // 🚀 PASO 4: Buscar en cache de 111movies
    const cached111 = await getM3u8Cache(type, id, season, episode, false);
    if (cached111) {
      const ageDays = ((Date.now() - cached111.timestamp) / 1000 / 60 / 60 / 24).toFixed(1);
      console.log(`⚡ [111MOVIES-CACHE-HIT] Usando m3u8 cacheado (${ageDays} días): ${cached111.streamUrl.substring(0, 60)}...`);
      sess = startSessionFromCache(cached111.streamUrl, type, id, season, episode);
      
      const playlistUrl = `/api/hls-browser-proxy/m3u8?sid=${encodeURIComponent(sess.id)}`;
      return NextResponse.json({ 
        ok: true, 
        sid: sess.id, 
        playlistUrl,
        cached: true,
        source: '111movies-cache'
      });
    }
    
    // 🔍 PASO 5: No hay cache, intentar VIDLINK primero
    if (tmdbId) {
      console.log(`🔍 [VIDLINK] Extrayendo m3u8 con Puppeteer para ${type}/${tmdbId}${season ? `/s${season}e${episode}` : ''}`);
      try {
        const vidlinkRes = await fetch(
          `http://localhost:3000/api/vidlink-puppeteer?type=${type}&id=${tmdbId}${season ? `&season=${season}&episode=${episode}` : ''}`
        );
        
        if (vidlinkRes.ok) {
          const vidlinkData = await vidlinkRes.json();
          
          if (vidlinkData.streamUrl) {
            console.log(`✅ [VIDLINK] Stream encontrado: ${vidlinkData.streamUrl.substring(0, 60)}...`);
            
            // Reescribir URLs de subtítulos para usar nuestro proxy (evitar CORS)
            let proxiedSubtitles: any[] = [];
            if (vidlinkData.subtitles && vidlinkData.subtitles.length > 0) {
              console.log(`📝 [VIDLINK] ${vidlinkData.subtitles.length} subtítulos disponibles`);
              
              proxiedSubtitles = vidlinkData.subtitles.map((sub: any) => ({
                url: `/api/subtitles/vidlink-proxy?url=${encodeURIComponent(sub.url)}`,
                language: sub.language,
                label: sub.label
              }));
              
              console.log(`🔄 [VIDLINK] Subtítulos reescritos para usar proxy local`);
            }
            
            sess = startSessionFromCache(vidlinkData.streamUrl, type, id, season, episode, vidlinkData.sourceUrl);
            
            const playlistUrl = `/api/hls-browser-proxy/m3u8?sid=${encodeURIComponent(sess.id)}`;
            return NextResponse.json({ 
              ok: true, 
              sid: sess.id, 
              playlistUrl,
              subtitles: proxiedSubtitles,
              cached: false,
              source: 'vidlink'
            });
          }
        }
      } catch (eVidlink: any) {
        console.log(`⚠️ [VIDLINK] Falló, intentando con videasy...`);
      }
    }
    
    // 🔍 PASO 6: Intentar VIDEASY
    if (tmdbId) {
      console.log(`🔍 [VIDEASY] Extrayendo m3u8 con Puppeteer para ${type}/${tmdbId}${season ? `/s${season}e${episode}` : ''}`);
      try {
        const videasyRes = await fetch(
          `http://localhost:3000/api/videasy-puppeteer?type=${type}&id=${tmdbId}${season ? `&season=${season}&episode=${episode}` : ''}`
        );
        
        if (videasyRes.ok) {
          const videasyData = await videasyRes.json();
          
          if (videasyData.streamUrl) {
            console.log(`✅ [VIDEASY] Stream encontrado: ${videasyData.streamUrl.substring(0, 60)}...`);
            sess = startSessionFromCache(videasyData.streamUrl, type, id, season, episode, videasyData.sourceUrl);
            
            const playlistUrl = `/api/hls-browser-proxy/m3u8?sid=${encodeURIComponent(sess.id)}`;
            return NextResponse.json({ 
              ok: true, 
              sid: sess.id, 
              playlistUrl,
              cached: false,
              source: 'videasy'
            });
          }
        }
      } catch (eVideasy: any) {
        console.log(`⚠️ [VIDEASY] Falló, intentando con vidking...`);
      }
    }
    
    // 🔍 PASO 7: FALLBACK a VIDKING
    if (tmdbId) {
      console.log(`🔍 [VIDKING] Extrayendo m3u8 con Puppeteer para ${type}/${tmdbId}${season ? `/s${season}e${episode}` : ''}`);
      try {
        const vidkingRes = await fetch(
          `http://localhost:3000/api/vidking-puppeteer?type=${type}&id=${tmdbId}${season ? `&season=${season}&episode=${episode}` : ''}`
        );
        
        if (vidkingRes.ok) {
          const vidkingData = await vidkingRes.json();
          
          if (vidkingData.streamUrl) {
            console.log(`✅ [VIDKING] Stream encontrado: ${vidkingData.streamUrl.substring(0, 60)}...`);
            sess = startSessionFromCache(vidkingData.streamUrl, type, id, season, episode, vidkingData.sourceUrl);
            
            const playlistUrl = `/api/hls-browser-proxy/m3u8?sid=${encodeURIComponent(sess.id)}`;
            return NextResponse.json({ 
              ok: true, 
              sid: sess.id, 
              playlistUrl,
              cached: false,
              source: 'vidking'
            });
          }
        }
      } catch (eVidking: any) {
        console.log(`⚠️ [VIDKING] Falló, intentando con 111movies...`);
      }
    }
    
    // 🔍 PASO 8: ÚLTIMO FALLBACK a 111movies
    console.log(`🔍 [111MOVIES] Extrayendo m3u8 con Puppeteer para ${type}/${id}${season ? `/s${season}e${episode}` : ''}`);
    sess = await startSession(type, id, season, episode);
    
    // 💾 Guardar en cache para futuras peticiones
    const sourceUrl = `https://111movies.com/${type === 'tv' ? 'tv' : 'movie'}/${id}${season ? `/${season}/${episode}` : ''}`;
    saveM3u8Cache(type, id, sess.m3u8Url, sourceUrl, season, episode).catch(() => {});

    const playlistUrl = `/api/hls-browser-proxy/m3u8?sid=${encodeURIComponent(sess.id)}`;
    return NextResponse.json({ 
      ok: true, 
      sid: sess.id, 
      playlistUrl,
      cached: false,
      source: '111movies'
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error iniciando proxy de navegador' }, { status: 500 });
  }
}