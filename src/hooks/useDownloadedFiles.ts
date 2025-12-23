'use client';

import { useState, useEffect } from 'react';
import { logger, cacheLogger } from '@/lib/logger';

export interface DownloadedFile {
  id: string;
  tmdbId: number;
  imdbId?: string;
  title: string;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  quality: string;
  size: string;
  magnetUri: string;
  torrentTitle: string;
  gofileUrl: string;
  gofileCode: string;
  gofileDirectUrl: string;
  uploadDate: string;
  fileSize: number;
  fileName: string;
  lastAccessed?: string;
}

interface UseDownloadedFilesOptions {
  onError?: (error: string) => void;
}

// Cache global para archivos descargados
const fileCache = new Map<string, { data: DownloadedFile[], timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos en milisegundos

// Cache en localStorage para persistencia entre sesiones
const getFromLocalStorage = (key: string): DownloadedFile[] | null => {
  try {
    const cached = localStorage.getItem(`gofile_cache_${key}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Verificar si el cache no ha expirado (30 minutos)
      if (Date.now() - parsed.timestamp < 30 * 60 * 1000) {
        return parsed.data;
      } else {
        localStorage.removeItem(`gofile_cache_${key}`);
      }
    }
    return null;
  } catch (error) {
    logger.warn('Error leyendo cache de localStorage:', error);
    return null;
    }};

const saveToLocalStorage = (key: string, data: DownloadedFile[]) => {
  try {
    localStorage.setItem(`gofile_cache_${key}`, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (error) {
      logger.warn('Error guardando en localStorage:', error);
    }
};

export function useDownloadedFiles(options: UseDownloadedFilesOptions = {}) {
  const [downloadedFiles, setDownloadedFiles] = useState<DownloadedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    options.onError?.(errorMessage);
  };

  // Base URL para la API de archivos descargados
  // Usar proxy interno de Next.js para evitar Mixed Content
  const API_BASE_URL = '/api/proxy-backend';

  // Función helper para verificar cache
  const getCachedData = (cacheKey: string): DownloadedFile[] | null => {
    // Primero verificar cache en memoria
    const memoryCache = fileCache.get(cacheKey);
    if (memoryCache && Date.now() - memoryCache.timestamp < CACHE_DURATION) {
      cacheLogger.log(`🚀 [CACHE-HIT] Usando cache en memoria para: ${cacheKey}`);
      return memoryCache.data;
    }

    // Si no hay en memoria, verificar localStorage
    const localStorageData = getFromLocalStorage(cacheKey);
    if (localStorageData) {
      cacheLogger.log(`💾 [CACHE-HIT] Usando cache de localStorage para: ${cacheKey}`);
      // Actualizar cache en memoria
      fileCache.set(cacheKey, { data: localStorageData, timestamp: Date.now() });
      return localStorageData;
    }

    return null;
  };

  // Función helper para guardar en cache
  const setCachedData = (cacheKey: string, data: DownloadedFile[]) => {
    // Guardar en memoria
    fileCache.set(cacheKey, { data, timestamp: Date.now() });
    // Guardar en localStorage
    saveToLocalStorage(cacheKey, data);
    cacheLogger.log(`💾 [CACHE-SAVE] Guardado en cache: ${cacheKey} (${data.length} archivos)`);
  };

  // Obtener archivos descargados para una película
  const getMovieFiles = async (tmdbId: number): Promise<DownloadedFile[]> => {
    const cacheKey = `movie_${tmdbId}`;
    
    // Verificar cache primero
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      setDownloadedFiles(cachedData);
      return cachedData;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // ⏱️ Timeout de 5 segundos para evitar bloqueos
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${API_BASE_URL}/api/downloaded-files/movie/${tmdbId}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        logger.log(`📁 [DOWNLOADED] Archivos encontrados para película ${tmdbId}:`, data.files.length);
        setDownloadedFiles(data.files);
        
        // Guardar en cache
        setCachedData(cacheKey, data.files);
        
        return data.files;
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error al obtener archivos descargados';
      logger.error('❌ [DOWNLOADED] Error:', errorMessage);
      handleError(errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Obtener archivos descargados para un episodio específico
  const getEpisodeFiles = async (tmdbId: number, season: number, episode: number): Promise<DownloadedFile[]> => {
    const cacheKey = `episode_${tmdbId}_s${season}e${episode}`;
    
    // Verificar cache primero
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      setDownloadedFiles(cachedData);
      return cachedData;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/downloaded-files/episode/${tmdbId}/${season}/${episode}`);
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        logger.log(`📁 [DOWNLOADED] Archivos encontrados para episodio ${tmdbId} S${season}E${episode}:`, data.files.length);
        setDownloadedFiles(data.files);
        
        // Guardar en cache
        setCachedData(cacheKey, data.files);
        
        return data.files;
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error al obtener archivos descargados';
      logger.error('❌ [DOWNLOADED] Error:', errorMessage);
      handleError(errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Obtener todos los archivos descargados para una serie
  const getShowFiles = async (tmdbId: number): Promise<DownloadedFile[]> => {
    const cacheKey = `show_${tmdbId}`;
    
    // Verificar cache primero
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      setDownloadedFiles(cachedData);
      return cachedData;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/downloaded-files/show/${tmdbId}`);
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        logger.log(`📁 [DOWNLOADED] Archivos encontrados para serie ${tmdbId}:`, data.files.length);
        setDownloadedFiles(data.files);
        
        // Guardar en cache
        setCachedData(cacheKey, data.files);
        
        return data.files;
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error al obtener archivos descargados';
      logger.error('❌ [DOWNLOADED] Error:', errorMessage);
      handleError(errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Actualizar último acceso de un archivo
  const updateLastAccessed = async (fileId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/downloaded-files/${fileId}/access`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        logger.log(`✅ [DOWNLOADED] Último acceso actualizado para archivo ${fileId}`);
        return true;
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error al actualizar último acceso';
      logger.error('❌ [DOWNLOADED] Error:', errorMessage);
      handleError(errorMessage);
      return false;
    }
  };

  // Eliminar un archivo descargado
  const removeFile = async (fileId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/downloaded-files/${fileId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        logger.log(`🗑️ [DOWNLOADED] Archivo ${fileId} eliminado`);
        // Actualizar la lista local
        setDownloadedFiles(prev => prev.filter(file => file.id !== fileId));
        return true;
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error al eliminar archivo';
      logger.error('❌ [DOWNLOADED] Error:', errorMessage);
      handleError(errorMessage);
      return false;
    }
  };

  // Obtener estadísticas de archivos descargados
  const getStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/downloaded-files/stats`);
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        logger.log('📊 [DOWNLOADED] Estadísticas:', data.stats);
        return data.stats;
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error al obtener estadísticas';
      logger.error('❌ [DOWNLOADED] Error:', errorMessage);
      handleError(errorMessage);
      return null;
    }
  };

  // Función de preloading para episodios siguientes
  const preloadNextEpisodes = async (tmdbId: number, currentSeason: number, currentEpisode: number, episodeCount: number = 3) => {
    logger.log(`🚀 [PRELOAD] Iniciando preload para próximos ${episodeCount} episodios desde S${currentSeason}E${currentEpisode}`);
    
    const preloadPromises: Promise<void>[] = [];
    
    for (let i = 1; i <= episodeCount; i++) {
      const nextEpisode = currentEpisode + i;
      const cacheKey = `episode_${tmdbId}_s${currentSeason}e${nextEpisode}`;
      
      // Solo precargar si no está en cache
      if (!getCachedData(cacheKey)) {
        const preloadPromise = fetch(`${API_BASE_URL}/api/downloaded-files/episode/${tmdbId}/${currentSeason}/${nextEpisode}`)
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              setCachedData(cacheKey, data.files);
              logger.log(`💾 [PRELOAD] Precargado S${currentSeason}E${nextEpisode}: ${data.files.length} archivos`);
            }
          })
          .catch(error => {
            logger.warn(`⚠️ [PRELOAD] Error precargando S${currentSeason}E${nextEpisode}:`, error.message);
          });
        
        preloadPromises.push(preloadPromise);
      }
    }
    
    // Ejecutar todas las precarga en paralelo
    if (preloadPromises.length > 0) {
      await Promise.allSettled(preloadPromises);
      logger.log(`✅ [PRELOAD] Completado preload de ${preloadPromises.length} episodios`);
    }
  };

  // Función de preloading para temporada completa
  const preloadSeason = async (tmdbId: number, season: number) => {
    const cacheKey = `show_${tmdbId}`;
    
    logger.log(`🚀 [PRELOAD] Iniciando preload de temporada completa S${season} para serie ${tmdbId}`);
    
    try {
      // Primero obtener todos los archivos de la serie si no están en cache
      if (!getCachedData(cacheKey)) {
        const response = await fetch(`${API_BASE_URL}/api/downloaded-files/show/${tmdbId}`);
        const data = await response.json();
        
        if (data.success) {
          setCachedData(cacheKey, data.files);
          logger.log(`💾 [PRELOAD] Precargada serie completa ${tmdbId}: ${data.files.length} archivos`);
          
          // Agrupar archivos por episodio y precargar en cache individual
          const episodeGroups = new Map<string, DownloadedFile[]>();
          
          data.files.forEach((file: DownloadedFile) => {
            if (file.season === season) {
              const episodeKey = `episode_${tmdbId}_s${file.season}e${file.episode}`;
              if (!episodeGroups.has(episodeKey)) {
                episodeGroups.set(episodeKey, []);
              }
              episodeGroups.get(episodeKey)!.push(file);
            }
          });
          
          // Guardar cada episodio en cache individual
          episodeGroups.forEach((files, episodeKey) => {
            setCachedData(episodeKey, files);
          });
          
          logger.log(`✅ [PRELOAD] Precargados ${episodeGroups.size} episodios de la temporada ${season}`);
        }
      }
    } catch (error) {
      logger.warn(`⚠️ [PRELOAD] Error precargando temporada ${season}:`, error);
    }
  };

  // Función para limpiar cache expirado
  const clearExpiredCache = () => {
    const now = Date.now();
    let clearedCount = 0;
    
    // Limpiar cache en memoria
    for (const [key, value] of fileCache.entries()) {
      if (now - value.timestamp > CACHE_DURATION) {
        fileCache.delete(key);
        clearedCount++;
      }
    }
    
    // Limpiar localStorage
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('gofile_cache_')) {
          try {
            const cached = JSON.parse(localStorage.getItem(key) || '{}');
            if (now - cached.timestamp > 30 * 60 * 1000) { // 30 minutos
              localStorage.removeItem(key);
              clearedCount++;
            }
          } catch (error) {
            localStorage.removeItem(key);
            clearedCount++;
          }
        }
      });
    } catch (error) {
      logger.warn('Error limpiando cache de localStorage:', error);
    }
    
    if (clearedCount > 0) {
      cacheLogger.log(`🧹 [CACHE] Limpiados ${clearedCount} elementos de cache expirados`);
    }
  };

  // Limpiar cache expirado al inicializar
  useEffect(() => {
    clearExpiredCache();
    
    // Limpiar cache cada 10 minutos
    const interval = setInterval(clearExpiredCache, 10 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    downloadedFiles,
    isLoading,
    error,
    getMovieFiles,
    getEpisodeFiles,
    getShowFiles,
    preloadNextEpisodes,
    preloadSeason,
    clearExpiredCache,
    updateLastAccessed,
    removeFile,
    getStats,
  };
}