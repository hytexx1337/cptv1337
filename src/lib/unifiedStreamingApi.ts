/**
 * Cliente para la API unificada de streaming
 * URL: https://streams.cineparatodos.lat
 */

const STREAMING_API_URL = process.env.NEXT_PUBLIC_STREAMING_API_URL || 'https://streams.cineparatodos.lat';

export interface StreamSource {
  streamUrl: string;
  subtitles?: Array<{
    url: string;
    lang: string;
    label?: string;
    default?: boolean;
  }>;
  provider: string;
  quality?: string;
  extractionTimeMs: number;
  server?: string;
}

export interface UnifiedStreamResponse {
  success: boolean;
  sources: {
    original: StreamSource | null;
    latino: StreamSource | null;
    englishDub: StreamSource | null;
  };
  metadata: {
    identifier: string;
    isAnime?: boolean;
    animeTitle?: string;
    extractedAt: string;
    totalTimeMs: number;
    cached: {
      original: boolean;
      latino: boolean;
      englishDub: boolean;
    };
    successCount: number;
    totalProviders: number;
  };
}

export interface FetchStreamParams {
  type: 'movie' | 'tv';
  tmdbId: number;
  season?: number;
  episode?: number;
  imdbId?: string; // Opcional, para futuro soporte
}

/**
 * Obtiene streams de la API unificada
 */
export async function fetchUnifiedStreams(params: FetchStreamParams): Promise<UnifiedStreamResponse> {
  const { type, tmdbId, season, episode } = params;

  // Construir URL
  let url = `${STREAMING_API_URL}/api/streams/extract/${type}/${tmdbId}`;
  
  if (type === 'tv' && season !== undefined && episode !== undefined) {
    url += `?season=${season}&episode=${episode}`;
  }

  console.log(`🎬 [UNIFIED-API] Fetching: ${url}`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Timeout de 60 segundos (Puppeteer puede tardar)
      signal: AbortSignal.timeout(60000),
    });

    const elapsedTime = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: UnifiedStreamResponse = await response.json();
    
    console.log(`✅ [UNIFIED-API] Success in ${elapsedTime}ms:`, {
      original: !!data.sources.original,
      latino: !!data.sources.latino,
      englishDub: !!data.sources.englishDub,
      isAnime: data.metadata.isAnime,
      cached: data.metadata.cached,
    });

    return data;
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    console.error(`❌ [UNIFIED-API] Error after ${elapsedTime}ms:`, error);
    throw error;
  }
}

/**
 * Convierte la respuesta de la API unificada al formato legacy de la app
 * (para compatibilidad con código existente)
 */
export function convertToLegacyFormat(data: UnifiedStreamResponse) {
  return {
    // Original (Vidlink/Anime SUB)
    original: data.sources.original ? {
      playlistUrl: data.sources.original.streamUrl,
      subtitles: data.sources.original.subtitles || [],
      cached: data.metadata.cached.original,
      source: data.sources.original.provider,
    } : null,

    // Latino (Cuevana)
    latino: data.sources.latino ? {
      streamUrl: data.sources.latino.streamUrl,
      cached: data.metadata.cached.latino,
      provider: data.sources.latino.provider,
    } : null,

    // English Dub (Vidify/Anime DUB)
    englishDub: data.sources.englishDub ? {
      streamUrl: data.sources.englishDub.streamUrl,
      subtitles: data.sources.englishDub.subtitles || [],
      cached: data.metadata.cached.englishDub,
      provider: data.sources.englishDub.provider,
      server: data.sources.englishDub.server,
    } : null,

    // Metadata
    metadata: {
      isAnime: data.metadata.isAnime || false,
      animeTitle: data.metadata.animeTitle,
      totalTimeMs: data.metadata.totalTimeMs,
      successCount: data.metadata.successCount,
    },
  };
}

