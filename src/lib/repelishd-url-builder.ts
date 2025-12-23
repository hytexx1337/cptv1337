// Repelishd URL Builder
// Base: https://repelishd.city/ver-pelicula/{TMDB_ID}-{TITULO_ES_MX}-online-espanol.html

interface TMDBMovie {
  id: number;
  title?: string;
}

interface TMDBTVShow {
  id: number;
  name?: string;
}

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

/**
 * Slugifica un título (convierte a formato URL-friendly)
 * Ejemplo: "Breaking Bad" → "breaking-bad"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD') // Normalizar caracteres con acento
    .replace(/[\u0300-\u036f]/g, '') // Eliminar diacríticos
    .replace(/[^a-z0-9]+/g, '-') // Reemplazar caracteres especiales con guión
    .replace(/^-+|-+$/g, ''); // Eliminar guiones al inicio/final
}

/**
 * Construye la URL de Repelishd para una película
 */
export async function buildRepelishdMovieUrl(tmdbId: number): Promise<string | null> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX`
    );

    if (!response.ok) {
      console.error(`❌ [REPELISHD-URL] Error fetching movie ${tmdbId}: ${response.status}`);
      return null;
    }

    const movie: TMDBMovie = await response.json();
    
    if (!movie.title) {
      console.error(`❌ [REPELISHD-URL] No title found for movie ${tmdbId}`);
      return null;
    }

    const slug = slugify(movie.title);
    const url = `https://repelishd.city/ver-pelicula/${tmdbId}-${slug}-online-espanol.html`;
    
    console.log(`✅ [REPELISHD-URL] Movie URL: ${url}`);
    return url;
  } catch (error: any) {
    console.error(`❌ [REPELISHD-URL] Error building movie URL:`, error.message);
    return null;
  }
}

/**
 * Construye la URL de Repelishd para una serie
 * Nota: Repelishd usa la misma URL para todas las temporadas/episodios
 */
export async function buildRepelishdTVUrl(tmdbId: number): Promise<string | null> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX`
    );

    if (!response.ok) {
      console.error(`❌ [REPELISHD-URL] Error fetching TV show ${tmdbId}: ${response.status}`);
      return null;
    }

    const show: TMDBTVShow = await response.json();
    
    if (!show.name) {
      console.error(`❌ [REPELISHD-URL] No name found for TV show ${tmdbId}`);
      return null;
    }

    const slug = slugify(show.name);
    const url = `https://repelishd.city/ver-pelicula/${tmdbId}-${slug}-online-espanol.html`;
    
    console.log(`✅ [REPELISHD-URL] TV URL: ${url}`);
    return url;
  } catch (error: any) {
    console.error(`❌ [REPELISHD-URL] Error building TV URL:`, error.message);
    return null;
  }
}

/**
 * Wrapper unificado que construye URL para película o serie
 */
export async function buildRepelishdUrl(
  type: 'movie' | 'tv',
  tmdbId: number
): Promise<string | null> {
  if (type === 'movie') {
    return buildRepelishdMovieUrl(tmdbId);
  } else {
    return buildRepelishdTVUrl(tmdbId);
  }
}

// Cache en memoria para evitar llamadas repetidas a TMDB
const urlCache = new Map<string, { url: string | null; timestamp: number }>();
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 días

/**
 * Versión con cache de buildRepelishdUrl
 */
export async function buildRepelishdUrlCached(
  type: 'movie' | 'tv',
  tmdbId: number
): Promise<string | null> {
  const cacheKey = `${type}-${tmdbId}`;
  const cached = urlCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`✅ [REPELISHD-URL-CACHE] Using cached URL for ${cacheKey}`);
    return cached.url;
  }

  const url = await buildRepelishdUrl(type, tmdbId);
  urlCache.set(cacheKey, { url, timestamp: Date.now() });
  
  return url;
}

