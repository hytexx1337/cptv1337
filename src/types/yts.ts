// Tipos para la API de YTS.mx

export interface YTSTorrent {
  url: string;
  hash: string;
  quality: string;
  type: string;
  seeds: number;
  peers: number;
  size: string;
  size_bytes: number;
  date_uploaded: string;
  date_uploaded_unix: number;
}

export interface YTSMovie {
  id: number;
  url: string;
  imdb_code: string;
  title: string;
  title_english: string;
  title_long: string;
  slug: string;
  year: number;
  rating: number;
  runtime: number;
  genres: string[];
  summary: string;
  description_full: string;
  synopsis: string;
  yt_trailer_code: string;
  language: string;
  mpa_rating: string;
  background_image: string;
  background_image_original: string;
  small_cover_image: string;
  medium_cover_image: string;
  large_cover_image: string;
  state: string;
  torrents: YTSTorrent[];
  date_uploaded: string;
  date_uploaded_unix: number;
  like_count?: number;
  download_count?: number;
}

export interface YTSListMoviesResponse {
  status: string;
  status_message: string;
  data: {
    movie_count: number;
    limit: number;
    page_number: number;
    movies: YTSMovie[];
  };
  '@meta': {
    server_time: number;
    server_timezone: string;
    api_version: number;
    execution_time: string;
  };
}

export interface YTSMovieDetailsResponse {
  status: string;
  status_message: string;
  data: {
    movie: YTSMovie;
  };
  '@meta': {
    server_time: number;
    server_timezone: string;
    api_version: number;
    execution_time: string;
  };
}

export interface YTSMovieSuggestionsResponse {
  status: string;
  status_message: string;
  data: {
    movie_count: number;
    movies: YTSMovie[];
  };
  '@meta': {
    server_time: number;
    server_timezone: string;
    api_version: number;
    execution_time: string;
  };
}

// Parámetros para las consultas
export interface YTSListMoviesParams {
  limit?: number; // 1-50, default 20
  page?: number; // default 1
  quality?: 'all' | '720p' | '1080p' | '2160p' | '3D'; // default all
  minimum_rating?: number; // 0-9, default 0
  query_term?: string; // search term
  genre?: string; // genre filter
  sort_by?: 'title' | 'year' | 'rating' | 'peers' | 'seeds' | 'download_count' | 'like_count' | 'date_added'; // default date_added
  order_by?: 'asc' | 'desc'; // default desc
  with_rt_ratings?: boolean; // include Rotten Tomatoes ratings
}

export interface YTSMovieDetailsParams {
  movie_id: number;
  with_images?: boolean; // include screenshot images
  with_cast?: boolean; // include cast information
}

export interface YTSMovieSuggestionsParams {
  movie_id: number;
}

// Tipos híbridos para combinar TMDB y YTS
export interface EnhancedMovie {
  // Datos base de TMDB
  tmdb_id?: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  genre_ids?: number[];
  genres?: string[];
  
  // Datos adicionales de YTS
  yts_id?: number;
  imdb_code?: string;
  year: number;
  runtime?: number;
  yt_trailer_code?: string;
  torrents?: YTSTorrent[];
  download_count?: number;
  like_count?: number;
  
  // URLs originales de YTS para uso directo
  yts_poster_url?: string;
  yts_backdrop_url?: string;
  
  // Metadatos
  source: 'tmdb' | 'yts' | 'hybrid';
}