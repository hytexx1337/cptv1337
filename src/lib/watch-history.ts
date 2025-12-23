import { logger } from '@/lib/logger';
/**
 * Watch History Manager
 * Maneja el historial de reproducción usando localStorage
 */

export interface WatchHistoryItem {
  id: string; // TMDB ID
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  stillPath?: string | null; // Miniatura del episodio (para series)
  season?: number;
  episode?: number;
  episodeTitle?: string;
  currentTime: number;
  duration: number;
  progress: number; // 0-100
  timestamp: number;
  lastWatched: Date;
}

class WatchHistoryManager {
  private readonly STORAGE_PREFIX = 'watch-';
  private readonly MAX_ITEMS = 20; // Máximo de items en historial

  /**
   * Obtener todo el historial de reproducción
   */
  getHistory(): WatchHistoryItem[] {
    const items: WatchHistoryItem[] = [];
    
    // Recorrer localStorage buscando keys con nuestro prefijo
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.includes('-progress')) continue;
      
      try {
        const data = localStorage.getItem(key);
        if (!data) continue;
        
        const progress = JSON.parse(data);
        
        // Parsear la key para extraer info
        // Formato: movie-{id}-progress o tv-{id}-{season}-{episode}-progress
        const item = this.parseStorageKey(key, progress);
        if (item) {
          logger.log('Found watch history item:', key, item);
          items.push(item);
        }
      } catch (error) {
        logger.error('Error parsing watch history item:', key, error);
        // Ignorar items con errores de parsing
      }
    }
    
    // Ordenar por timestamp (más reciente primero)
    items.sort((a, b) => b.timestamp - a.timestamp);
    
    // Limitar a MAX_ITEMS
    return items.slice(0, this.MAX_ITEMS);
  }

  /**
   * Obtener solo items con progreso significativo (> 5% y < 95%)
   * Para series de TV, solo muestra el episodio más reciente de cada serie
   */
  getContinueWatching(): WatchHistoryItem[] {
    const allItems = this.getHistory().filter(item => 
      item.progress > 1 && item.progress < 95
    );

    logger.log('All items after filtering:', allItems);

    // Separar películas y series
    const movies = allItems.filter(item => item.mediaType === 'movie');
    const tvShows = allItems.filter(item => item.mediaType === 'tv');

    logger.log('Movies:', movies);
    logger.log('TV Shows:', tvShows);

    // Para series, agrupar por ID y tomar solo el más reciente de cada serie
    const uniqueTvShows: WatchHistoryItem[] = [];
    const seenSeriesIds = new Set<string>();

    // Los items ya están ordenados por timestamp (más reciente primero)
    for (const tvItem of tvShows) {
      if (!seenSeriesIds.has(tvItem.id)) {
        uniqueTvShows.push(tvItem);
        seenSeriesIds.add(tvItem.id);
      }
    }

    logger.log('Unique TV Shows:', uniqueTvShows);

    // Combinar películas y series únicas, mantener orden por timestamp
    const combinedItems = [...movies, ...uniqueTvShows];
    combinedItems.sort((a, b) => b.timestamp - a.timestamp);

    logger.log('Final combined items:', combinedItems);

    return combinedItems;
  }

  /**
   * Obtener progreso de un item específico
   */
  getProgress(mediaType: 'movie' | 'tv', id: string, season?: number, episode?: number): WatchHistoryItem | null {
    const key = this.buildStorageKey(mediaType, id, season, episode);
    const data = localStorage.getItem(key);
    
    if (!data) return null;
    
    try {
      const progress = JSON.parse(data);
      return this.parseStorageKey(key, progress);
    } catch {
      return null;
    }
  }

  /**
   * Guardar progreso
   */
  saveProgress(
    mediaType: 'movie' | 'tv',
    id: string,
    currentTime: number,
    duration: number,
    metadata?: {
      title?: string;
      posterPath?: string;
      backdropPath?: string;
      stillPath?: string; // Miniatura del episodio (para series)
      season?: number;
      episode?: number;
      episodeTitle?: string;
    }
  ) {
    // Validación estricta del ID para evitar entradas inválidas
    if (!id || id.trim() === '' || id === '0' || id === 'undefined' || id === 'null') {
      logger.warn(`⚠️ [WATCH HISTORY] No se puede guardar progreso: ID inválido (${id})`);
      return;
    }

    const key = this.buildStorageKey(mediaType, id, metadata?.season, metadata?.episode);
    let progress = (currentTime / duration) * 100;
    // Clamp progress to [0, 100]
    if (!Number.isFinite(progress)) progress = 0;
    progress = Math.max(0, Math.min(100, progress));

    // Read existing progress and prevent regressions (e.g., teardown saving 0%)
    try {
      const existingRaw = localStorage.getItem(key);
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        const existingDuration = existing.duration || 0;
        const existingTime = existing.currentTime || 0;
        const existingProgress = existing.progress !== undefined && Number.isFinite(existing.progress)
          ? existing.progress
          : (existingDuration > 0 ? (existingTime / existingDuration) * 100 : 0);

        // If new progress is significantly lower than existing, ignore this save
        if (existingProgress > 0 && progress < existingProgress - 2) {
          logger.warn(`⚠️ [WATCH HISTORY] Ignorando regresión de progreso: ${progress.toFixed(1)}% < ${existingProgress.toFixed(1)}%`);
          return;
        }

        // Monotonic: never decrease progress
        progress = Math.max(progress, existingProgress);
      }
    } catch {
      // Ignore parsing errors and proceed with save
    }
    
    logger.log(`💾 [WATCH HISTORY] Guardando en localStorage: ${key}`);
    
    localStorage.setItem(key, JSON.stringify({
      currentTime,
      duration,
      progress,
      timestamp: Date.now(),
      ...metadata,
    }));
  }

  /**
   * Eliminar un item del historial
   */
  removeItem(mediaType: 'movie' | 'tv', id: string, season?: number, episode?: number) {
    const key = this.buildStorageKey(mediaType, id, season, episode);
    localStorage.removeItem(key);
  }

  /**
   * Limpiar todo el historial
   */
  clearHistory() {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('-progress')) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  /**
   * Construir key de storage
   */
  private buildStorageKey(mediaType: 'movie' | 'tv', id: string, season?: number, episode?: number): string {
    if (mediaType === 'movie') {
      return `movie-${id}-progress`;
    } else {
      return `tv-${id}-${season}-${episode}-progress`;
    }
  }

  /**
   * Parsear key de storage para extraer información
   */
  private parseStorageKey(key: string, progress: any): WatchHistoryItem | null {
    try {
      // Remover sufijo -progress
      const keyWithoutSuffix = key.replace('-progress', '');
      const parts = keyWithoutSuffix.split('-');
      
      // Calcular progress si no está presente (para datos antiguos)
      const currentTime = progress.currentTime || 0;
      const duration = progress.duration || 0;
      const calculatedProgress = duration > 0 ? (currentTime / duration) * 100 : 0;
      const progressValue = progress.progress !== undefined ? progress.progress : calculatedProgress;
      
      if (parts[0] === 'movie') {
        // Format: movie-{id}
        return {
          id: parts[1],
          mediaType: 'movie',
          title: progress.title || 'Unknown Movie',
          posterPath: progress.posterPath || null,
          backdropPath: progress.backdropPath || null,
          currentTime,
          duration,
          progress: progressValue,
          timestamp: progress.timestamp || Date.now(),
          lastWatched: new Date(progress.timestamp || Date.now()),
        };
      } else if (parts[0] === 'tv') {
        // Format: tv-{id}-{season}-{episode}
        return {
          id: parts[1],
          mediaType: 'tv',
          title: progress.title || 'Unknown Series',
          posterPath: progress.posterPath || null,
          backdropPath: progress.backdropPath || null,
          stillPath: progress.stillPath || null, // Miniatura del episodio
          season: parseInt(parts[2]),
          episode: parseInt(parts[3]),
          episodeTitle: progress.episodeTitle,
          currentTime,
          duration,
          progress: progressValue,
          timestamp: progress.timestamp || Date.now(),
          lastWatched: new Date(progress.timestamp || Date.now()),
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Error parsing storage key:', error);
      return null;
    }
  }

  /**
   * Formatear tiempo en formato MM:SS
   */
  formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

// Singleton instance
export const watchHistory = new WatchHistoryManager();

