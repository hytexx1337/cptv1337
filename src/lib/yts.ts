// Servicio para la API de YTS.mx

import { logger } from '@/lib/logger';
import {
  YTSListMoviesResponse,
  YTSMovieDetailsResponse,
  YTSMovieSuggestionsResponse,
  YTSListMoviesParams,
  YTSMovieDetailsParams,
  YTSMovieSuggestionsParams,
  YTSMovie,
  EnhancedMovie
} from '@/types/yts';

const YTS_BASE_URL = 'https://yts.mx/api/v2';

// Función auxiliar para construir URLs con parámetros
const buildUrl = (endpoint: string, params: Record<string, any> = {}): string => {
  const url = new URL(`${YTS_BASE_URL}${endpoint}`);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value.toString());
    }
  });
  
  return url.toString();
};

// Función auxiliar para manejar errores de la API
const handleApiError = (error: any, context: string): never => {
  logger.error(`YTS API Error (${context}):`, error);
  throw new Error(`Error fetching data from YTS API: ${context}`);
};

/**
 * Obtiene una lista de películas de YTS
 */
export const getYTSMovies = async (params: YTSListMoviesParams = {}): Promise<YTSMovie[]> => {
  try {
    const url = buildUrl('/list_movies.json', params);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data: YTSListMoviesResponse = await response.json();
    
    if (data.status !== 'ok') {
      throw new Error(data.status_message || 'Unknown API error');
    }
    
    return data.data?.movies || [];
  } catch (error) {
    logger.error('YTS API Error (getYTSMovies):', error);
    return [];
  }
};

/**
 * Obtiene detalles específicos de una película de YTS
 */
export const getYTSMovieDetails = async (params: YTSMovieDetailsParams): Promise<YTSMovie | null> => {
  try {
    const url = buildUrl('/movie_details.json', params);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data: YTSMovieDetailsResponse = await response.json();
    
    if (data.status !== 'ok') {
      throw new Error(data.status_message || 'Unknown API error');
    }
    
    return data.data?.movie || null;
  } catch (error) {
    logger.error('YTS API Error (getYTSMovieDetails):', error);
    return null;
  }
};

/**
 * Obtiene sugerencias de películas relacionadas de YTS
 */
export const getYTSMovieSuggestions = async (params: YTSMovieSuggestionsParams): Promise<YTSMovie[]> => {
  try {
    const url = buildUrl('/movie_suggestions.json', params);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data: YTSMovieSuggestionsResponse = await response.json();
    
    if (data.status !== 'ok') {
      throw new Error(data.status_message || 'Unknown API error');
    }
    
    return data.data?.movies || [];
  } catch (error) {
    logger.error('YTS API Error (getYTSMovieSuggestions):', error);
    return [];
  }
};

/**
 * Busca películas en YTS por término de búsqueda
 */
export const searchYTSMovies = async (query: string, limit: number = 20): Promise<YTSMovie[]> => {
  return getYTSMovies({
    query_term: query,
    limit,
    sort_by: 'rating',
    order_by: 'desc'
  });
};

/**
 * Obtiene películas populares de YTS
 */
export const getPopularYTSMovies = async (limit: number = 20): Promise<YTSMovie[]> => {
  return getYTSMovies({
    limit,
    sort_by: 'download_count',
    order_by: 'desc',
    minimum_rating: 6.0
  });
};

/**
 * Obtiene películas recientes de YTS
 */
export const getRecentYTSMovies = async (limit: number = 20): Promise<YTSMovie[]> => {
  return getYTSMovies({
    limit,
    sort_by: 'date_added',
    order_by: 'desc'
  });
};

/**
 * Convierte una película de YTS a formato EnhancedMovie
 */
export const convertYTSToEnhanced = (ytsMovie: YTSMovie): EnhancedMovie => {
  // Extraer solo el nombre del archivo de la URL de YTS para usar con TMDB
  const extractImagePath = (ytsImageUrl: string): string | null => {
    if (!ytsImageUrl) return null;
    
    // Si ya es una URL completa de YTS, extraer el nombre del archivo
    const match = ytsImageUrl.match(/\/([^\/]+)\.jpg$/);
    if (match) {
      return `/yts/${match[1]}.jpg`; // Prefijo para identificar imágenes de YTS
    }
    
    return null;
  };

  return {
    title: ytsMovie.title_english || ytsMovie.title,
    overview: ytsMovie.summary || ytsMovie.description_full || '',
    poster_path: extractImagePath(ytsMovie.large_cover_image || ytsMovie.medium_cover_image),
    backdrop_path: extractImagePath(ytsMovie.background_image_original || ytsMovie.background_image),
    release_date: `${ytsMovie.year}-01-01`, // YTS solo tiene año
    vote_average: ytsMovie.rating,
    genres: ytsMovie.genres,
    
    // Datos específicos de YTS
    yts_id: ytsMovie.id,
    imdb_code: ytsMovie.imdb_code,
    year: ytsMovie.year,
    runtime: ytsMovie.runtime,
    yt_trailer_code: ytsMovie.yt_trailer_code,
    torrents: ytsMovie.torrents,
    download_count: ytsMovie.download_count,
    like_count: ytsMovie.like_count,
    
    // URLs originales de YTS para uso directo
    yts_poster_url: ytsMovie.large_cover_image || ytsMovie.medium_cover_image,
    yts_backdrop_url: ytsMovie.background_image_original || ytsMovie.background_image,
    
    source: 'yts'
  };
};

/**
 * Busca una película de YTS por código IMDB
 */
export const getYTSMovieByIMDB = async (imdbCode: string): Promise<YTSMovie | null> => {
  try {
    const movies = await getYTSMovies({
      query_term: imdbCode,
      limit: 1
    });
    
    return movies.find(movie => movie.imdb_code === imdbCode) || null;
  } catch (error) {
    logger.error('Error searching YTS movie by IMDB:', error);
    return null;
  }
};

/**
 * Obtiene el enlace magnet para un torrent específico
 */
export const getMagnetLink = (hash: string, movieTitle: string, trackers?: string[]): string => {
  const defaultTrackers = [
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.openbittorrent.com:80',
    'udp://tracker.coppersurfer.tk:6969',
    'udp://glotorrents.pw:6969/announce',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://torrent.gresille.org:80/announce',
    'udp://p4p.arenabg.com:1337',
    'udp://tracker.leechers-paradise.org:6969'
  ];
  
  const allTrackers = trackers || defaultTrackers;
  const encodedTitle = encodeURIComponent(movieTitle);
  const trackerParams = allTrackers.map(tracker => `tr=${encodeURIComponent(tracker)}`).join('&');
  
  return `magnet:?xt=urn:btih:${hash}&dn=${encodedTitle}&${trackerParams}`;
};