import { useState, useCallback, useRef } from 'react';
import { streamLogger, logger } from '@/lib/logger';

interface TorrentFile {
  index: number;
  name: string;
  size: number;
  path: string;
}

interface TorrentInfo {
  torrentId: string;
  name: string;
  length: number;
  hash?: string; // Hash del torrent para identificación única
  files: TorrentFile[];
  videoFiles: TorrentFile[];
  subtitleFiles: Array<{
    index: number;
    name: string;
    path: string;
    language: string;
    format: string;
  }>;
}

export interface EpisodeInfo {
  season: number;
  episode: number;
}

interface UseTorrentStreamOptions {
  serverUrl?: string; // Ya no se usa - las rutas proxy son relativas
  onError?: (error: string) => void;
}

interface StreamState {
  isLoading: boolean;
  torrentInfo: TorrentInfo | null;
  streamUrl: string | null;
  streamId: string | null;
  selectedFileIndex: number | null;
}

export function useTorrentStream({ serverUrl = '', onError }: UseTorrentStreamOptions) {
  const [state, setState] = useState<StreamState>({
    isLoading: false,
    torrentInfo: null,
    streamUrl: null,
    streamId: null,
    selectedFileIndex: null,
  });

  // Usar ref para mantener el torrentId actual sin causar re-renders
  const currentTorrentIdRef = useRef<string | null>(null);
  
  // Agregar flag para prevenir múltiples inicializaciones simultáneas
  const isInitializingRef = useRef<boolean>(false);

  const handleError = useCallback((message: string) => {
    logger.error('❌ [STREAM]', message);
    if (onError) onError(message);
    setState(prev => ({ ...prev, isLoading: false }));
    isInitializingRef.current = false; // Reset flag en caso de error
  }, [onError]);

  // Iniciar streaming
  const startStreaming = useCallback(async (magnetUri: string, episodeInfo?: EpisodeInfo, movieMetadata?: any) => {
    if (!magnetUri.trim()) {
      handleError('Por favor ingresa un enlace magnet válido');
      return;
    }

    // Prevenir múltiples inicializaciones simultáneas
    if (isInitializingRef.current) {
      streamLogger.log('⚠️ [STREAM] Inicialización ya en progreso, ignorando nueva solicitud');
      return;
    }

    // Marcar como inicializando
    isInitializingRef.current = true;

    streamLogger.log('🚀 Iniciando streaming...');
    if (episodeInfo) {
      streamLogger.log(`📺 Episodio: S${episodeInfo.season.toString().padStart(2, '0')}E${episodeInfo.episode.toString().padStart(2, '0')}`);
    }
    
    // Extraer hash del magnet para identificar el torrent
    const hashMatch = magnetUri.match(/btih:([a-f0-9]{40})/i);
    const torrentHash = hashMatch ? hashMatch[1].toLowerCase() : null;
    
    // Primero detener cualquier stream existente
    if (currentTorrentIdRef.current) {
      streamLogger.log('🛑 Deteniendo stream anterior:', currentTorrentIdRef.current);
      try {
        const deleteResponse = await fetch(`/api/torrent/${currentTorrentIdRef.current}`, {
          method: 'DELETE',
        });
        streamLogger.log('✅ Stream anterior detenido:', deleteResponse.status);
        currentTorrentIdRef.current = null;
        
        // Delay para asegurar que el servidor limpie completamente
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        streamLogger.warn('⚠️ [STREAM] Error deteniendo stream anterior (ignorando):', error);
        currentTorrentIdRef.current = null;
      }
    }

    setState(prev => ({ 
      ...prev, 
      isLoading: true,
      torrentProgress: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      numPeers: 0,
    }));

    try {
      const requestBody: { magnetUri: string; episodeInfo?: EpisodeInfo; movieMetadata?: any } = { magnetUri };
      if (episodeInfo) {
        requestBody.episodeInfo = episodeInfo;
      }
      if (movieMetadata) {
        requestBody.movieMetadata = movieMetadata;
      }

      let response = await fetch(`/api/stream/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // Si falla por duplicado y tenemos el hash, intentar eliminar y reintentar
      if (!response.ok) {
        const errorData = await response.json();
        
        if (errorData.error?.includes('duplicate') && torrentHash) {
          streamLogger.log('🔄 Torrent duplicado detectado, intentando limpiar:', torrentHash);
          
          try {
            // Intentar eliminar el torrent duplicado usando el hash
            await fetch(`/api/torrent/${torrentHash}`, {
              method: 'DELETE',
            });
            
            // Esperar a que se limpie
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Reintentar el POST
            streamLogger.log('🔄 Reintentando después de limpiar duplicado...');
            response = await fetch(`/api/stream/start`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
            });
            
            if (!response.ok) {
              const retryError = await response.json();
              throw new Error(retryError.error || 'Error al reintentar el streaming');
            }
          } catch (retryError) {
            logger.error('❌ [STREAM] Error en retry:', retryError);
            throw new Error(errorData.error || 'Error al iniciar el streaming');
          }
        } else {
          throw new Error(errorData.error || 'Error al iniciar el streaming');
        }
      }

      const streamData = await response.json();
      streamLogger.log('✅ Stream iniciado:', streamData);

      // Construir info del torrent
      const torrentInfo: TorrentInfo = {
        torrentId: streamData.streamId,
        name: streamData.torrentName || streamData.fileName || 'Unknown',
        length: streamData.totalSize || streamData.fileSize || 0,
        files: streamData.files || [{
          index: 0,
          name: streamData.fileName,
          size: streamData.fileSize,
          path: streamData.fileName,
        }],
        videoFiles: streamData.files 
          ? streamData.files.filter((file: any) => 
              file.name.match(/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v)$/i)
            )
          : [{
              index: 0,
              name: streamData.fileName,
              size: streamData.fileSize,
              path: streamData.fileName,
            }],
        subtitleFiles: streamData.files 
          ? streamData.files
              .filter((file: any) => 
                file.name.match(/\.(srt|vtt|ass|ssa|sub|sbv)$/i)
              )
              .map((file: any) => ({
                index: file.index,
                name: file.name,
                path: file.path || file.name,
                language: 'unknown',
                format: file.name.split('.').pop()?.toLowerCase() || 'srt',
              }))
          : [],
      };

      // Construir URL del stream usando proxy HTTPS para Chromecast
      const streamUrl = `/api/stream/proxy/${streamData.streamId}`;
      
      // Actualizar ref con el nuevo torrentId
      currentTorrentIdRef.current = streamData.streamId;
      
      // Reset flag de inicialización
      isInitializingRef.current = false;
      
      setState({
        isLoading: false,
        torrentInfo,
        streamUrl,
        streamId: streamData.streamId,
        selectedFileIndex: streamData.selectedFileIndex || 0,
      });

      return { torrentInfo, streamUrl };

    } catch (error) {
      handleError(error instanceof Error ? error.message : 'Error desconocido');
      return null;
    }
  }, [handleError]);

  // Detener streaming
  const stopStreaming = useCallback(async () => {
    try {
      if (currentTorrentIdRef.current) {
        streamLogger.log(`🛑 [STREAM] Deteniendo stream: ${currentTorrentIdRef.current}`);
        
        await fetch(`/api/stream/stop/${currentTorrentIdRef.current}`, {
          method: 'POST',
        });
        
        currentTorrentIdRef.current = null;
      }
      
      setState({
        isLoading: false,
        torrentInfo: null,
        streamUrl: null,
        streamId: null,
        selectedFileIndex: null,
      });
      
      // Resetear el flag de inicialización
      isInitializingRef.current = false;
      
    } catch (error) {
      streamLogger.error('Error stopping stream:', error);
    }
  }, []);

  // Cambiar archivo del torrent
  const selectFile = useCallback((fileIndex: number) => {
    const torrentId = currentTorrentIdRef.current;
    if (!torrentId) return;

    const streamUrl = `/api/stream/proxy/${torrentId}`;
    
    setState(prev => ({
      ...prev,
      selectedFileIndex: fileIndex,
      streamUrl,
    }));

    streamLogger.log('🎬 [STREAM] Archivo seleccionado (índice):', fileIndex);
  }, [serverUrl]);

  // Sistema de heartbeat
  const sendHeartbeat = useCallback(async (isPaused: boolean, currentTime: number) => {
    const streamId = currentTorrentIdRef.current;
    if (!streamId) return;

    try {
      await fetch(`/api/stream/heartbeat/${streamId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isActive: true,
          isPaused,
          currentTime,
          timestamp: Date.now(),
        }),
      });
    } catch (error) {
      streamLogger.error('❌ [HEARTBEAT] Error:', error);
    }
  }, [serverUrl]);

  return {
    ...state,
    startStreaming,
    stopStreaming,
    selectFile,
    sendHeartbeat,
  };
}

