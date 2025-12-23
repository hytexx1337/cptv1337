/**
 * Helper para construir URLs de Cuevana.biz basadas en títulos de TMDB (es-MX)
 */

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

/**
 * Convierte título a slug para URLs de Cuevana
 * Ejemplo: "Dragon Ball Z: La batalla de Freezer" → "dragon-ball-z-la-batalla-de-freezer"
 */
function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD') // Descompone caracteres acentuados (á → a + ´)
    .replace(/[\u0300-\u036f]/g, '') // Remueve diacríticos
    .replace(/[^a-z0-9\s-]/g, '') // Solo letras, números, espacios y guiones
    .trim()
    .replace(/\s+/g, '-') // Espacios → guiones
    .replace(/-+/g, '-'); // Múltiples guiones → uno solo
}

/**
 * Obtiene el título en español latino (es-MX) desde TMDB
 */
async function getTitleEsMX(
  type: 'movie' | 'tv',
  tmdbId: number
): Promise<string | null> {
  try {
    const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX`;
    const response = await fetch(url, {
      next: { revalidate: 86400 } // Cache 24 horas
    });

    if (!response.ok) {
      console.error(`❌ [TMDB] Error ${response.status} para ${type} ${tmdbId}`);
      return null;
    }

    const data = await response.json();
    const title = type === 'movie' ? data.title : data.name;

    if (!title) {
      console.error(`❌ [TMDB] No title found for ${type} ${tmdbId}`);
      return null;
    }

    console.log(`✅ [TMDB] Título es-MX: "${title}"`);
    return title;
  } catch (error) {
    console.error(`❌ [TMDB] Error fetching:`, error);
    return null;
  }
}

/**
 * Genera URL de Cuevana.biz para scraping
 * 
 * @param type - 'movie' o 'tv'
 * @param tmdbId - ID de TMDB
 * @param season - Número de temporada (solo para TV)
 * @param episode - Número de episodio (solo para TV)
 * @returns URL de Cuevana o null si falla
 */
export async function buildCuevanaUrl(
  type: 'movie' | 'tv',
  tmdbId: number,
  season?: number,
  episode?: number
): Promise<string | null> {
  // Obtener título en español
  const title = await getTitleEsMX(type, tmdbId);

  if (!title) {
    console.error(`❌ [CUEVANA] No se pudo obtener título es-MX para ${type} ${tmdbId}`);
    return null;
  }

  // Generar slug
  const fullSlug = titleToSlug(title);

  if (type === 'movie') {
    // Películas: ver-pelicula/{tmdbId}/{slug-completo}
    const url = `https://cuevana.biz/ver-pelicula/${tmdbId}/${fullSlug}`;
    console.log(`🎬 [CUEVANA] URL película: ${url}`);
    return url;
  } else {
    // Series: ver-serie/{tmdbId}/{primera-palabra}/temporada/{season}/episodio/{episode}
    // Ejemplo: "Dexter: New Blood" → "dexter"
    const seriesSlug = fullSlug.split('-')[0];
    
    if (!season || !episode) {
      console.error(`❌ [CUEVANA] Season y episode requeridos para TV`);
      return null;
    }

    const url = `https://cuevana.biz/ver-serie/${tmdbId}/${seriesSlug}/temporada/${season}/episodio/${episode}`;
    console.log(`📺 [CUEVANA] URL serie: ${url}`);
    return url;
  }
}

/**
 * Cache de URLs generadas (evita llamadas repetidas a TMDB)
 */
const urlCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

/**
 * Versión con cache de buildCuevanaUrl
 */
export async function buildCuevanaUrlCached(
  type: 'movie' | 'tv',
  tmdbId: number,
  season?: number,
  episode?: number
): Promise<string | null> {
  const cacheKey = `${type}-${tmdbId}${season ? `-s${season}e${episode}` : ''}`;
  const cached = urlCache.get(cacheKey);

  // Retornar del cache si es válido
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    console.log(`⚡ [CUEVANA-CACHE] URL recuperada del cache: ${cacheKey}`);
    return cached.url;
  }

  // Generar nueva URL
  const url = await buildCuevanaUrl(type, tmdbId, season, episode);

  if (url) {
    urlCache.set(cacheKey, { url, timestamp: Date.now() });
  }

  return url;
}

