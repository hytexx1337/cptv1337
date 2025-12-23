export interface CustomStream {
  id: string; // UUID generado automáticamente
  tmdbId: number; // ID de TMDB
  type: 'movie' | 'tv'; // Tipo de contenido
  title: string; // Título para referencia
  streamUrl: string; // URL del stream
  language: string; // Idioma (ej: 'es-MX', 'es-ES')
  quality?: string; // Calidad (ej: '1080p', '720p')
  
  // Para series:
  season?: number;
  episode?: number;
  episodeTitle?: string;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  notes?: string; // Notas adicionales
}

export interface CustomStreamResponse {
  streams: CustomStream[];
  total: number;
}

