import { NextRequest, NextResponse } from 'next/server';
import { getM3u8Cache } from '@/lib/m3u8-cache';
import { buildCuevanaUrlCached } from '@/lib/cuevana-url-builder';
import { fetchAllVidifyStreams } from '@/lib/vidify-crypto';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutos (incluye scraping de cuevana)

const CUSTOM_STREAMS_PATH = path.join(process.cwd(), 'data', 'custom-streams.json');
const SCRAPER_SERVICE_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:3001';
const RETRY_AFTER_DAYS = 7; // Días antes de reintentar unavailable

interface CustomStream {
  id: string;
  type: 'movie' | 'tv';
  tmdbId: number;
  title?: string;
  streamUrl?: string;
  language?: string;
  quality?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  notes?: string;
  unavailable?: boolean;
  reason?: string;
  attemptedAt?: string;
  retryAfter?: string;
  createdAt: string;
  updatedAt?: string;
}

interface CustomStreamsData {
  streams: CustomStream[];
}

/**
 * Asegura que el archivo custom-streams.json existe
 */
function ensureCustomStreamsFile() {
  if (!fs.existsSync(CUSTOM_STREAMS_PATH)) {
    const dir = path.dirname(CUSTOM_STREAMS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CUSTOM_STREAMS_PATH, JSON.stringify({ streams: [] }, null, 2));
  }
}

/**
 * Lee custom-streams.json
 */
function loadCustomStreams(): CustomStreamsData {
  ensureCustomStreamsFile();
  const content = fs.readFileSync(CUSTOM_STREAMS_PATH, 'utf-8');
  return JSON.parse(content);
}

/**
 * Guarda custom-streams.json
 */
function saveCustomStreams(data: CustomStreamsData) {
  fs.writeFileSync(CUSTOM_STREAMS_PATH, JSON.stringify(data, null, 2));
}

/**
 * Busca un stream latino en custom-streams.json
 */
function findCustomStream(
  type: 'movie' | 'tv',
  tmdbId: number,
  season?: number,
  episode?: number
): CustomStream | null {
  const data = loadCustomStreams();

  if (type === 'movie') {
    return data.streams.find(
      s => s.type === 'movie' && s.tmdbId === tmdbId
    ) || null;
  } else {
    return data.streams.find(
      s => s.type === 'tv' && 
           s.tmdbId === tmdbId && 
           s.season === season && 
           s.episode === episode
    ) || null;
  }
}

/**
 * Guarda un nuevo stream (success o unavailable) en custom-streams.json
 */
function saveNewCustomStream(
  type: 'movie' | 'tv',
  tmdbId: number,
  streamUrl: string | null,
  reason: string | null,
  season?: number,
  episode?: number,
  title?: string
) {
  const data = loadCustomStreams();
  const now = new Date().toISOString();

  const newStream: CustomStream = {
    id: randomUUID(),
    type,
    tmdbId,
    season,
    episode,
    createdAt: now,
  };

  if (streamUrl) {
    // SUCCESS
    newStream.streamUrl = streamUrl;
    newStream.language = 'es-MX';
    newStream.quality = '1080p';
    newStream.notes = 'Extraído de cuevana.biz';
    
    // Agregar título si está disponible
    if (title) {
      newStream.title = title;
    }
    
    console.log(`💾 [CUSTOM-STREAM] Guardado: ${type} ${tmdbId}${season ? ` S${season}E${episode}` : ''}`);
  } else {
    // FAIL
    newStream.unavailable = true;
    newStream.reason = reason || 'No se encontró stream';
    newStream.attemptedAt = now;
    newStream.retryAfter = new Date(Date.now() + RETRY_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
    console.log(`❌ [CUSTOM-STREAM] Marcado como unavailable: ${type} ${tmdbId}${season ? ` S${season}E${episode}` : ''}`);
  }

  data.streams.push(newStream);
  saveCustomStreams(data);
}

/**
 * Llama al microservicio de scraping
 */
async function callScraperService(
  type: 'movie' | 'tv',
  tmdbId: number,
  url: string,
  season?: number,
  episode?: number
): Promise<{ streamUrl: string | null; reason: string | null; title?: string }> {
  try {
    console.log(`📡 [SCRAPER] Llamando a ${SCRAPER_SERVICE_URL}/scrape...`);
    
    // Timeout de 125s (más que el del servicio que es 120s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 125000);
    
    const response = await fetch(`${SCRAPER_SERVICE_URL}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, tmdbId, url, season, episode }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Scraper service responded with ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.streamUrl) {
      return { streamUrl: data.streamUrl, reason: null, title: data.title };
    } else {
      return { streamUrl: null, reason: data.reason || 'Scraping failed' };
    }
  } catch (error: any) {
    console.error(`❌ [SCRAPER] Error:`, error.message);
    return { streamUrl: null, reason: error.message };
  }
}

/**
 * Buscar stream original (inglés) - VIDLINK
 */
async function fetchOriginalStream(
  type: 'movie' | 'tv',
  tmdbId: number,
  season?: number,
  episode?: number
) {
  try {
    const cacheKey = `vidlink-${type}`;
    const cached = await getM3u8Cache(cacheKey, tmdbId.toString(), season?.toString(), episode?.toString(), false);

    if (cached) {
      const ageDays = ((Date.now() - cached.timestamp) / 1000 / 60 / 60 / 24).toFixed(1);
      console.log(`✅ [VIDLINK-CACHE-HIT] Stream original encontrado (${ageDays} días)`);
      
      return {
        streamUrl: cached.streamUrl,
        source: 'vidlink',
        subtitles: cached.subtitles || [],
        cached: true,
        cacheAgeDays: parseFloat(ageDays)
      };
    }

    // No está en cache, llamar a vidlink-puppeteer
    console.log(`⚠️ [VIDLINK] No cache, llamando a vidlink-puppeteer...`);
    
    const vidlinkUrl = `/api/vidlink-puppeteer?type=${type}&id=${tmdbId}${season ? `&season=${season}&episode=${episode}` : ''}`;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const fullUrl = `${baseUrl}${vidlinkUrl}`;
    
    const vidlinkResponse = await fetch(fullUrl);
    
    if (vidlinkResponse.ok) {
      const vidlinkData = await vidlinkResponse.json();
      console.log(`✅ [VIDLINK] Stream original extraído`);
      return {
        streamUrl: vidlinkData.streamUrl,
        source: 'vidlink',
        subtitles: vidlinkData.subtitles || [],
        cached: false
      };
    }

    return null;
  } catch (error) {
    console.error(`❌ [VIDLINK] Error:`, error);
    return null;
  }
}

/**
 * Buscar stream latino - CUEVANA
 */
async function fetchLatinoStream(
  type: 'movie' | 'tv',
  tmdbId: number,
  season?: number,
  episode?: number
) {
  try {
    const customStream = findCustomStream(type, tmdbId, season, episode);

    if (customStream) {
      if (customStream.unavailable) {
        // Verificar si ya pasó el tiempo de retry
        const retryAfter = customStream.retryAfter ? new Date(customStream.retryAfter).getTime() : 0;
        const now = Date.now();

        if (now < retryAfter) {
          const daysUntilRetry = ((retryAfter - now) / 1000 / 60 / 60 / 24).toFixed(1);
          console.log(`⏰ [CUEVANA] Stream marcado como unavailable, reintentar en ${daysUntilRetry} días`);
          
          return {
            unavailable: true,
            reason: customStream.reason,
            retryAfter: customStream.retryAfter
          };
        }

        // Ya pasó el tiempo, reintentar
        console.log(`🔄 [CUEVANA] Tiempo de retry alcanzado, reintentando...`);
      } else if (customStream.streamUrl) {
        // Stream disponible
        console.log(`✅ [CUEVANA-CACHE-HIT] Stream latino encontrado`);
        return {
          streamUrl: customStream.streamUrl,
          source: 'cuevana',
          cached: true
        };
      }
    }

    // Si no está en cache O es hora de retry, intentar scraping
    console.log(`📡 [CUEVANA] Iniciando scraping...`);

    // Construir URL de Cuevana
    const cuevanaUrl = await buildCuevanaUrlCached(type, tmdbId, season, episode);

    if (!cuevanaUrl) {
      console.error(`❌ [CUEVANA] No se pudo construir URL`);
      return {
        unavailable: true,
        reason: 'No se pudo construir URL de Cuevana'
      };
    }

    // Llamar al scraper service
    const scraperResult = await callScraperService(type, tmdbId, cuevanaUrl, season, episode);

    if (scraperResult.streamUrl) {
      // Guardar resultado exitoso
      saveNewCustomStream(
        type,
        tmdbId,
        scraperResult.streamUrl,
        null,
        season,
        episode,
        scraperResult.title
      );

      return {
        streamUrl: scraperResult.streamUrl,
        source: 'cuevana',
        cached: false
      };
    } else {
      // Guardar como unavailable
      saveNewCustomStream(
        type,
        tmdbId,
        null,
        scraperResult.reason,
        season,
        episode,
        undefined
      );

      return {
        unavailable: true,
        reason: scraperResult.reason
      };
    }
  } catch (error: any) {
    console.error(`❌ [CUEVANA] Error:`, error);
    return {
      unavailable: true,
      reason: error.message || 'Internal error'
    };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as 'movie' | 'tv';
  const tmdbId = parseInt(searchParams.get('id') || '0');
  const season = searchParams.get('season') ? parseInt(searchParams.get('season')!) : undefined;
  const episode = searchParams.get('episode') ? parseInt(searchParams.get('episode')!) : undefined;
  const quickMode = searchParams.get('quick') === 'true'; // Modo rápido: retornar inmediatamente

  if (!type || !tmdbId) {
    return NextResponse.json({ error: 'Missing type or id' }, { status: 400 });
  }

  if (type === 'tv' && (!season || !episode)) {
    return NextResponse.json({ error: 'For TV, season and episode are required' }, { status: 400 });
  }

  const identifier = type === 'movie' ? `Movie ${tmdbId}` : `TV ${tmdbId} S${season}E${episode}`;

  // ========== MODO RÁPIDO: Verificar cache primero ==========
  if (quickMode) {
    console.log(`\n⚡ [UNIFIED-API] Modo rápido para: ${identifier}`);
    
    // Verificar cache de latino
    const customStream = findCustomStream(type, tmdbId, season, episode);
    
    if (customStream?.streamUrl) {
      // Latino ya está en cache, ejecutar ambos en paralelo
      console.log(`✅ [QUICK] Latino en cache, ejecutando ambos en paralelo`);
      const [original, latino] = await Promise.all([
        fetchOriginalStream(type, tmdbId, season, episode),
        Promise.resolve({
          streamUrl: customStream.streamUrl,
          source: 'cuevana',
          cached: true
        })
      ]);

      return NextResponse.json({ original, latino });
    }

    // Latino no está en cache, retornar solo inglés y marcar latino como "scraping"
    console.log(`⚡ [QUICK] Latino no en cache, retornando inglés + lanzando scraping en background`);
    
    const original = await fetchOriginalStream(type, tmdbId, season, episode);
    
    // Lanzar scraping de latino en background (no await)
    fetchLatinoStream(type, tmdbId, season, episode)
      .then((result) => {
        if (result.streamUrl) {
          console.log(`✅ [BACKGROUND-SCRAPING] Completado exitosamente para ${identifier}`);
        } else {
          console.log(`❌ [BACKGROUND-SCRAPING] No se encontró stream para ${identifier}: ${result.reason}`);
        }
      })
      .catch(err => {
        console.error(`❌ [BACKGROUND-SCRAPING] Error para ${identifier}:`, err.message);
      });

    return NextResponse.json({
      original,
      latino: {
        scraping: true,
        message: 'Scraping en progreso, hacer polling para obtener resultado'
      }
    });
  }

  // ========== MODO NORMAL: Ejecutar ambas búsquedas en paralelo ==========
  console.log(`\n🔍 [UNIFIED-API] Buscando streams EN PARALELO para: ${identifier}`);
  
  const [original, latino] = await Promise.all([
    fetchOriginalStream(type, tmdbId, season, episode),
    fetchLatinoStream(type, tmdbId, season, episode)
  ]);

  console.log(`\n✅ [UNIFIED-API] Respuesta completa para ${identifier}`);
  return NextResponse.json({
    original,
    latino
  });
}

