import { logger } from '@/lib/logger';
// Utilidades para TMDb

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/';

export const getImageUrl = (path: string | null, size: 'w342' | 'w500' | 'w780' | 'w1280' | 'original' = 'w342'): string => {
  if (!path) return '/placeholder-movie.svg'; // Placeholder para imágenes faltantes
  
  // Si la URL ya es completa (YTS), devolverla tal como está
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // Si es una ruta de YTS (comienza con /yts/), construir la URL completa
  if (path.startsWith('/yts/')) {
    return `https://img.yts.mx${path}`;
  }
  
  // Para rutas de TMDB (comienzan con /)
  return `${TMDB_IMAGE_BASE_URL}${size}${path}`;
};

export const getYear = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  return new Date(dateString).getFullYear().toString();
};

export const formatRating = (rating: number | undefined): string => {
  if (!rating || rating === 0) return 'N/A';
  return rating.toFixed(1);
};

export const getTitle = (item: { title?: string; name?: string }): string => {
  return item.title || item.name || 'Sin título';
};

export const getOriginalTitle = (item: { original_title?: string; original_name?: string; title?: string; name?: string }): string => {
  return item.original_title || item.original_name || item.title || item.name || 'Sin título';
};

export const getReleaseDate = (item: { release_date?: string; first_air_date?: string }): string => {
  return item.release_date || item.first_air_date || '';
};

// Verificar si una película es solo de streaming/digital (no teatral)
// Usa la API de release_dates de TMDB para determinar los tipos de lanzamiento
export const isStreamingOnlyMovie = async (movieId: number): Promise<boolean> => {
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/movie/${movieId}/release_dates?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`
    );
    
    if (!response.ok) {
      return false; // Si no podemos verificar, aplicamos la restricción por seguridad
    }
    
    const data = await response.json();
    const allReleases = data.results?.flatMap((country: any) => 
      country.release_dates?.map((release: any) => release.type) || []
    ) || [];
    
    // Tipos de lanzamiento TMDB:
    // 1: Premiere, 2: Theatrical (limited), 3: Theatrical, 4: Digital, 5: Physical, 6: TV
    const hasTheatricalRelease = allReleases.some((type: number) => type === 2 || type === 3);
    const hasOnlyDigitalOrTV = allReleases.length > 0 && allReleases.every((type: number) => type === 4 || type === 6);
    
    // Es streaming-only si no tiene lanzamiento teatral Y solo tiene lanzamientos digitales/TV
    return !hasTheatricalRelease && hasOnlyDigitalOrTV;
  } catch (error) {
    logger.error('Error verificando tipo de lanzamiento:', error);
    return false; // Si hay error, aplicamos la restricción por seguridad
  }
};

// Verificar si el contenido está disponible para streaming
// Para películas: debe tener al menos 60 días desde su lanzamiento, EXCEPTO si es contenido streaming-only
// Para series: siempre disponibles (pueden tener torrents de temporadas anteriores)
export const isAvailableForStreaming = async (
  item: { id?: number; release_date?: string; first_air_date?: string }, 
  mediaType?: 'movie' | 'tv'
): Promise<boolean> => {
  const releaseDate = getReleaseDate(item);
  if (!releaseDate) return false;
  
  // Las series siempre están disponibles para búsqueda de torrents
  if (mediaType === 'tv' || item.first_air_date) {
    return true;
  }
  
  // Para películas, verificar si es contenido streaming-only
  if (mediaType === 'movie' && item.id) {
    const isStreamingOnly = await isStreamingOnlyMovie(item.id);
    if (isStreamingOnly) {
      return true; // Las películas streaming-only están siempre disponibles
    }
  }
  
  // Para películas teatrales, mantener la restricción de 60 días
  const released = new Date(releaseDate);
  const now = new Date();
  const daysSinceRelease = Math.floor((now.getTime() - released.getTime()) / (1000 * 60 * 60 * 24));
  
  return daysSinceRelease >= 60;
};

/**
 * Detectar si un contenido es anime japonés
 * Criterios:
 * - Género Animation (ID 16)
 * - País de origen incluye "JP" (Japón)
 * - Idioma original es "ja" (japonés)
 */
export const isAnime = (item: {
  genres?: Array<{ id: number; name: string }>;
  origin_country?: string[];
  original_language?: string;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
}): boolean => {
  // Verificar si tiene el género Animation (ID 16)
  const hasAnimationGenre = item.genres?.some(g => g.id === 16) ?? false;
  
  // Verificar país de origen (TV shows usan origin_country, Movies usan production_countries)
  const hasJapaneseOrigin = 
    item.origin_country?.includes('JP') ||
    item.production_countries?.some(c => c.iso_3166_1 === 'JP') ||
    false;
  
  // Verificar idioma original japonés
  const hasJapaneseLanguage = item.original_language === 'ja';
  
  // Es anime si cumple al menos 2 de 3 criterios (para mayor precisión)
  const criteriaCount = [hasAnimationGenre, hasJapaneseOrigin, hasJapaneseLanguage].filter(Boolean).length;
  
  return criteriaCount >= 2;
};

/**
 * Obtener el logo de una película o serie
 * Prioriza logos en español, luego sin texto, luego inglés
 */
export const getMediaLogo = async (
  id: number,
  mediaType: 'movie' | 'tv'
): Promise<string | null> => {
  try {
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    if (!apiKey) return null;

    const response = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${id}/images?api_key=${apiKey}&include_image_language=en`
    );

    if (!response.ok) return null;

    const data = await response.json();
    const logos = data.logos || [];

    if (logos.length === 0) return null;

    // Solo usar logos en inglés
    const englishLogo = logos.find((logo: any) => logo.iso_639_1 === 'en');

    const selectedLogo = englishLogo;

    return selectedLogo?.file_path ? getImageUrl(selectedLogo.file_path, 'w500') : null;
  } catch (error) {
    logger.error('Error obteniendo logo de TMDB:', error);
    return null;
  }
};