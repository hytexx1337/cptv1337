import { NextRequest, NextResponse } from 'next/server';
import { fetchAllVidifyStreams } from '@/lib/vidify-crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10; // Optimizado: Primer servidor que responda (1-3s typical)

// 📦 CACHÉ EN MEMORIA - TTL 7 días
interface CachedStream {
  url: string; // URL original (sin proxear)
  server: string;
  language: string;
  cachedAt: number;
  expiresAt: number;
}

const streamCache = new Map<string, CachedStream>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 días en ms
const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // Limpiar cada 6 horas

// Limpieza automática de caché expirado
let cleanupTimer: NodeJS.Timeout | null = null;
function startCacheCleanup() {
  if (cleanupTimer) return; // Ya está corriendo
  
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of streamCache.entries()) {
      if (value.expiresAt < now) {
        streamCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 [VIDIFY-CACHE] Limpieza automática: ${cleaned} entradas expiradas eliminadas`);
    }
  }, CLEANUP_INTERVAL) as unknown as NodeJS.Timeout;
}

// Iniciar limpieza cuando se importa el módulo
startCacheCleanup();

function getCacheKey(tmdbId: string, type: string, season?: number, episode?: number, language?: string): string {
  if (language) {
    return `${tmdbId}-${type}-${season || 'movie'}-${episode || 'movie'}-${language}`;
  }
  return `${tmdbId}-${type}-${season || 'movie'}-${episode || 'movie'}`;
}

function getCachedStream(key: string): CachedStream | null {
  const cached = streamCache.get(key);
  if (!cached) return null;
  
  // Verificar si expiró
  if (cached.expiresAt < Date.now()) {
    console.log(`⏰ [VIDIFY-CACHE] Entrada expirada: ${key}`);
    streamCache.delete(key);
    return null;
  }
  
  const ageInHours = Math.floor((Date.now() - cached.cachedAt) / (60 * 60 * 1000));
  console.log(`✅ [VIDIFY-CACHE] Hit: ${key} (${ageInHours}h antiguo, server: ${cached.server})`);
  return cached;
}

function setCachedStream(key: string, stream: CachedStream): void {
  streamCache.set(key, stream);
  console.log(`💾 [VIDIFY-CACHE] Guardado: ${key} (expira en 7 días, server: ${stream.server})`);
}

function invalidateCacheForContent(tmdbId: string, type: string, season?: number, episode?: number): void {
  const baseKey = getCacheKey(tmdbId, type, season, episode);
  const languages = ['original Lang', 'English Dub', 'LATIN Dub'];
  
  languages.forEach(lang => {
    const key = getCacheKey(tmdbId, type, season, episode, lang);
    if (streamCache.delete(key)) {
      console.log(`🗑️ [VIDIFY-CACHE] Invalidado: ${key}`);
    }
  });
}

/**
 * Nueva API unificada que usa Vidify para obtener streams
 * Reemplaza a /api/streams/unified
 * 
 * GET /api/streams/vidify-unified?type=tv&id=127532&season=1&episode=5
 * GET /api/streams/vidify-unified?type=movie&id=550
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as 'movie' | 'tv';
  const tmdbId = searchParams.get('id');
  const season = searchParams.get('season') ? parseInt(searchParams.get('season')!) : undefined;
  const episode = searchParams.get('episode') ? parseInt(searchParams.get('episode')!) : undefined;
  const includeOriginal = searchParams.get('includeOriginal') === 'true'; // Nuevo parámetro

  if (!type || !tmdbId) {
    return NextResponse.json({ error: 'Missing type or id' }, { status: 400 });
  }

  if (type === 'tv' && (!season || !episode)) {
    return NextResponse.json({ error: 'For TV, season and episode are required' }, { status: 400 });
  }

  const identifier = type === 'movie' ? `Movie ${tmdbId}` : `TV ${tmdbId} S${season}E${episode}`;

  try {
    console.log(`\n🎬 [VIDIFY-UNIFIED] Obteniendo streams para: ${identifier}${includeOriginal ? ' (incluye original)' : ''}`);
    
    const response: any = {
      original: null,
      englishDub: null,
      latino: null
    };
    
    // 🔍 PASO 1: Determinar qué idiomas buscar
    const languagesToFetch = includeOriginal 
      ? ['original Lang', 'English Dub', 'LATIN Dub'] // Fallback de Vidlink: buscar TODO
      : ['English Dub', 'LATIN Dub']; // Normal: solo audios alternativos
    
    console.log(`🌐 [VIDIFY-UNIFIED] Consultando Vidify para: ${languagesToFetch.join(', ')}...`);
    
    // Verificar caché primero
    const cachedStreams: { [key: string]: CachedStream } = {};
    let allCached = true;
    
    for (const lang of languagesToFetch) {
      const cacheKey = getCacheKey(tmdbId, type, season, episode, lang);
      const cached = getCachedStream(cacheKey);
      if (cached) {
        cachedStreams[lang] = cached;
      } else {
        allCached = false;
      }
    }
    
    let allStreams: any[] = [];
    
    if (allCached && Object.keys(cachedStreams).length === languagesToFetch.length) {
      console.log(`✅ [VIDIFY-CACHE] Todos los streams en caché para ${languagesToFetch.join(', ')}`);
      
      // Convertir caché a formato de streams
      allStreams = Object.entries(cachedStreams).map(([lang, cached]) => ({
        url: cached.url,
        server: cached.server,
        language: lang,
        score: 0,
        accessible: true,
        latency: 0,
        qualitiesCount: 0
      }));
    } else {
      // Obtener todos los streams de Vidify
      const rawStreams = await fetchAllVidifyStreams(
        tmdbId,
        type,
        season,
        episode
      );
      
      // 🚫 FILTRAR: NO incluir "original Lang" a menos que se solicite explícitamente
      if (includeOriginal) {
        allStreams = rawStreams; // Incluir TODO cuando es fallback de Vidlink
        console.log(`🔍 [VIDIFY-UNIFIED] Modo fallback: ${rawStreams.length} streams (incluye original)`);
      } else {
        allStreams = rawStreams.filter(s => s.language !== 'original Lang');
        console.log(`🔍 [VIDIFY-UNIFIED] Filtrado: ${rawStreams.length} streams → ${allStreams.length} streams (excluido original Lang)`);
      }
      
      // 💾 Guardar en caché
      if (allStreams.length > 0) {
        const now = Date.now();
        const expiresAt = now + CACHE_TTL;
        
        allStreams.forEach(stream => {
          const cacheKey = getCacheKey(tmdbId, type, season, episode, stream.language);
          setCachedStream(cacheKey, {
            url: stream.url,
            server: stream.server,
            language: stream.language,
            cachedAt: now,
            expiresAt
          });
        });
      }
    }

    // Separar por idioma
    const originalStreams = allStreams.filter(s => s.language === 'original Lang');
    const englishDubStreams = allStreams.filter(s => s.language === 'English Dub');
    const latinoStreams = allStreams.filter(s => s.language === 'LATIN Dub');

    console.log(`✅ [VIDIFY-UNIFIED] Encontrados: ${originalStreams.length} original, ${englishDubStreams.length} English Dub, ${latinoStreams.length} Latino`);
    
    // Original (solo si se solicitó)
    if (includeOriginal && originalStreams.length > 0) {
      const best = originalStreams[0];
      const metadata = `&type=${type}&id=${tmdbId}${season ? `&season=${season}&episode=${episode}` : ''}&language=${encodeURIComponent('original Lang')}`;
      const proxiedUrl = `/api/vidify-proxy/m3u8?url=${encodeURIComponent(best.url)}${metadata}`;
      response.original = {
        streamUrl: proxiedUrl,
        sourceUrl: `vidify:${best.server}`,
        source: 'vidify',
        server: best.server,
        subtitles: [],
        cached: !!cachedStreams['original Lang'],
        type,
        id: tmdbId,
        season,
        episode
      };
      console.log(`✅ [VIDIFY-UNIFIED] Original desde Vidify (fallback): ${best.server}`);
    }

    if (englishDubStreams.length > 0) {
      const best = englishDubStreams[0];
      // Proxear URL con metadata para invalidación automática
      const metadata = `&type=${type}&id=${tmdbId}${season ? `&season=${season}&episode=${episode}` : ''}&language=${encodeURIComponent('English Dub')}`;
      const proxiedUrl = `/api/vidify-proxy/m3u8?url=${encodeURIComponent(best.url)}${metadata}`;
      response.englishDub = {
        streamUrl: proxiedUrl,
        sourceUrl: `vidify:${best.server}`,
        source: 'vidify',
        server: best.server,
        subtitles: [],
        cached: !!cachedStreams['English Dub'], // Indicar si vino de caché
        type,
        id: tmdbId,
        season,
        episode
      };
    }

    if (latinoStreams.length > 0) {
      const best = latinoStreams[0];
      // Proxear URL con metadata para invalidación automática
      const metadata = `&type=${type}&id=${tmdbId}${season ? `&season=${season}&episode=${episode}` : ''}&language=${encodeURIComponent('LATIN Dub')}`;
      const proxiedUrl = `/api/vidify-proxy/m3u8?url=${encodeURIComponent(best.url)}${metadata}`;
      response.latino = {
        streamUrl: proxiedUrl,
        sourceUrl: `vidify:${best.server}`,
        source: 'vidify',
        server: best.server,
        subtitles: [],
        cached: !!cachedStreams['LATIN Dub'], // Indicar si vino de caché
        type,
        id: tmdbId,
        season,
        episode
      };
    }

    // Resumen final
    if (response.original || response.englishDub || response.latino) {
      const available = [];
      if (response.original) available.push('Original (vidify)');
      if (response.englishDub) available.push('English Dub');
      if (response.latino) available.push('Latino');
      console.log(`✅ [VIDIFY-UNIFIED] Devolviendo: ${available.join(', ')}`);
    } else {
      console.log(`⚠️ [VIDIFY-UNIFIED] No se encontraron streams para ${identifier}`);
    }

    return NextResponse.json(response);

  } catch (error: any) {
    console.error(`❌ [VIDIFY-UNIFIED] Error:`, error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE endpoint para invalidar caché cuando un stream falla
 * DELETE /api/streams/vidify-unified?type=tv&id=127532&season=1&episode=5&language=original%20Lang
 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as 'movie' | 'tv';
  const tmdbId = searchParams.get('id');
  const season = searchParams.get('season') ? parseInt(searchParams.get('season')!) : undefined;
  const episode = searchParams.get('episode') ? parseInt(searchParams.get('episode')!) : undefined;
  const language = searchParams.get('language'); // Optional: invalidar solo un idioma

  if (!type || !tmdbId) {
    return NextResponse.json({ error: 'Missing type or id' }, { status: 400 });
  }

  try {
    if (language) {
      // Invalidar solo un idioma específico
      const key = getCacheKey(tmdbId, type, season, episode, language);
      const deleted = streamCache.delete(key);
      console.log(`🗑️ [VIDIFY-CACHE] Invalidación manual: ${key} (${deleted ? 'eliminado' : 'no encontrado'})`);
      return NextResponse.json({ success: true, deleted, key });
    } else {
      // Invalidar todo el contenido
      invalidateCacheForContent(tmdbId, type, season, episode);
      return NextResponse.json({ success: true, message: 'All languages invalidated' });
    }
  } catch (error: any) {
    console.error(`❌ [VIDIFY-CACHE] Error al invalidar:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

