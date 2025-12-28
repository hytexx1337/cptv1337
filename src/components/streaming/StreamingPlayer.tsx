'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useVideoPlayer } from '@/hooks/useVideoPlayer';
import { useTorrentStream } from '@/hooks/useTorrentStream';
import { useSubtitles } from '@/hooks/useSubtitles';
import { useIntroTimings } from '@/hooks/useIntroTimings';
import VideoPlayer from './VideoPlayer';
import TorrentSelector from './TorrentSelector';
import SubtitleControls from './SubtitleControls';
import EpisodeSelector from '@/components/EpisodeSelector';
import SkipIntroButton from '@/components/SkipIntroButton';
import NextUpOverlay from '@/components/NextUpOverlay';
import '@/styles/loading-shimmer.css';
import { streamLogger, subtitleLogger, logger } from '@/lib/logger';
import { watchHistory } from '@/lib/watch-history';
import io, { Socket } from 'socket.io-client';

// Helper para determinar idioma original y bandera según país de origen
const getOriginalLanguageInfo = (originCountries?: string[]) => {
  const firstCountry = originCountries?.[0];
  
  // Japón -> Japonés
  if (firstCountry === 'JP') {
    return { flagCode: 'jp', label: 'ORIGINAL' };
  }
  // Korea -> Coreano
  if (firstCountry === 'KR') {
    return { flagCode: 'kr', label: 'ORIGINAL' };
  }
  // USA/UK/CA/AU -> Inglés
  if (['US', 'GB', 'CA', 'AU'].includes(firstCountry || '')) {
    return { flagCode: 'us', label: 'ORIGINAL' };
  }
  // España/Latinoamérica -> Español
  if (['ES', 'MX', 'AR', 'CO', 'CL'].includes(firstCountry || '')) {
    return { flagCode: 'es', label: 'ORIGINAL' };
  }
  // Francia -> Francés
  if (firstCountry === 'FR') {
    return { flagCode: 'fr', label: 'ORIGINAL' };
  }
  // China -> Chino
  if (firstCountry === 'CN') {
    return { flagCode: 'cn', label: 'ORIGINAL' };
  }
  // India -> Hindi
  if (firstCountry === 'IN') {
    return { flagCode: 'in', label: 'ORIGINAL' };
  }
  
  // Por defecto (desconocido)
  return { flagCode: 'world', label: 'ORIGINAL' };
};

  interface StreamingPlayerProps {
    magnetUri?: string;
    goFileUrl?: string;
    directStreamUrl?: string; // URL de stream directa (p.ej. M3U8 capturada)
    customStreamUrl?: string; // URL de stream personalizado (español latino)
    englishDubStreamUrl?: string; // URL de stream en inglés doblado (English Dub)
    externalSubtitles?: Array<{ url: string; language: string; label: string }>; // Subtítulos externos de VidLink, etc.
    watchPartyRoomId?: string; // ID de sala de Watch Party para sincronización
    watchPartyUsername?: string; // Username para Watch Party
    hasNextEpisode?: boolean; // Si hay un siguiente episodio disponible
    nextEpisodeData?: { // Datos del siguiente episodio para el Next Up overlay
      season: number;
      episode: number;
      title?: string;
      stillPath?: string;
    };
    movieMetadata?: {
    imdbId?: string;
    tmdbId?: string | number;
    title?: string;
    season?: number;  // Para series
    episode?: number; // Para series
    episodeTitle?: string; // Título del episodio (para series)
    backdropPath?: string; // Backdrop horizontal para loading screen
    logoPath?: string; // Logo oficial de TMDB para pantalla de carga
    year?: number | string; // Año de lanzamiento
    rating?: number; // Puntaje (0-10)
    overview?: string; // Sinopsis
    originCountries?: string[]; // 🆕 Países de origen para determinar idioma original
    };
    tvMetadata?: {
      tmdbId?: string | number;
      title?: string;
      season?: number;
      episode?: number;
    };
    onError?: (error: string) => void;
    isModalPlayer?: boolean; // Si está dentro de un modal (oculta info extra)
    onEpisodeSelect?: (season: number, episode: number, episodeData: any) => void; // Callback para cambio de episodio
    onClose?: () => void; // Callback para cerrar el reproductor
    onTimeUpdate?: (time: number) => void; // Callback para reportar el tiempo actual (útil para admin panel)
  }

  export default function StreamingPlayer({
    magnetUri,
    goFileUrl,
    directStreamUrl,
    customStreamUrl,
    englishDubStreamUrl,
    externalSubtitles = [],
    watchPartyRoomId,
    watchPartyUsername,
    hasNextEpisode = false,
    nextEpisodeData,
    movieMetadata,
    tvMetadata,
    onError,
    isModalPlayer = false,
    onEpisodeSelect,
    onClose,
    onTimeUpdate,
  }: StreamingPlayerProps) {
  const [error, setError] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | undefined>(undefined);
  const [movieHash, setMovieHash] = useState<string | null>(null);
  const [movieByteSize, setMovieByteSize] = useState<number | null>(null);
  const [posterOpacity, setPosterOpacity] = useState(0.5);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTitle, setShowTitle] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  
  // Audio selection state (Original vs English Dub vs Latino)
  const [selectedAudio, setSelectedAudio] = useState<'original' | 'englishDub' | 'latino'>('original');
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [audioSwitchKey, setAudioSwitchKey] = useState(0); // Key para forzar reinicialización al cambiar audio
  const [audioMenuPosition, setAudioMenuPosition] = useState({ bottom: 0, right: 0 }); // Posición dinámica del menú
  
  // Auto-seleccionar audio disponible cuando solo hay uno
  useEffect(() => {
    const hasOriginal = !!(directStreamUrl || goFileUrl);
    const hasEnglishDub = !!englishDubStreamUrl;
    const hasLatino = !!customStreamUrl;
    
    // Si no hay original pero hay latino, auto-seleccionar latino
    if (!hasOriginal && !hasEnglishDub && hasLatino && selectedAudio === 'original') {
      logger.log('🎧 [AUTO-SELECT] No hay Original, auto-seleccionando Latino');
      setSelectedAudio('latino');
    }
    // Si no hay original pero hay english dub (y no latino), auto-seleccionar english dub
    else if (!hasOriginal && hasEnglishDub && !hasLatino && selectedAudio === 'original') {
      logger.log('🎧 [AUTO-SELECT] No hay Original, auto-seleccionando English Dub');
      setSelectedAudio('englishDub');
    }
  }, [directStreamUrl, goFileUrl, englishDubStreamUrl, customStreamUrl, selectedAudio]);
  
  // Watch Party
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isWatchPartyActive, setIsWatchPartyActive] = useState(false);
  const [watchPartyUsers, setWatchPartyUsers] = useState<Array<{username: string, isHost: boolean}>>([]);
  const [watchPartyMessages, setWatchPartyMessages] = useState<Array<{user: string, message: string, timestamp: number}>>([]);
  const [watchPartyError, setWatchPartyError] = useState<string | null>(null);
  const [showWatchPartyChat, setShowWatchPartyChat] = useState(false);
  const isSyncingRef = useRef(false); // Flag para evitar loops de sincronización

  // ELIMINADO: Listener para forzar reload del player
  // Ya no es necesario - el botón de configuración ahora es parte del player desde el inicio

  // DEBUG: Log cuando el componente se monta/desmonta
  useEffect(() => {
    logger.log('🔷 [STREAMING-PLAYER] Componente MONTADO', {
      goFileUrl: !!goFileUrl,
      directStreamUrl: !!directStreamUrl,
      magnetUri: !!magnetUri,
      customStreamUrl: !!customStreamUrl,
      englishDubStreamUrl: !!englishDubStreamUrl,
      tmdbId: movieMetadata?.tmdbId || tvMetadata?.tmdbId,
      season: movieMetadata?.season || tvMetadata?.season,
      episode: movieMetadata?.episode || tvMetadata?.episode,
      watchPartyRoomId,
      watchPartyUsername,
    });
    return () => {
      logger.log('🔶 [STREAMING-PLAYER] Componente DESMONTADO');
    };
  }, []);

  // DEBUG: Log cuando customStreamUrl cambia
  useEffect(() => {
    if (customStreamUrl) {
      logger.log('🎧 [STREAMING-PLAYER] customStreamUrl DETECTADO:', customStreamUrl.substring(0, 60) + '...');
      logger.log('🎧 [STREAMING-PLAYER] El botón de audio debería estar visible ahora');
    } else {
      logger.log('🎧 [STREAMING-PLAYER] customStreamUrl es NULL, botón de audio oculto');
    }
  }, [customStreamUrl]);

  // Detectar cambios en el estado de pantalla completa (igual que EpisodeSelector)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  
  // Calcular posición del menú de audio basado en la posición del botón
  useEffect(() => {
    if (!showAudioMenu) return;

    const calculateMenuPosition = () => {
      const audioButton = document.querySelector('.vjs-audio-selector-button');
      const playerEl = document.querySelector('.video-js');
      
      if (audioButton && playerEl) {
        const buttonRect = audioButton.getBoundingClientRect();
        const playerRect = playerEl.getBoundingClientRect();
        
        // Calcular posición relativa al reproductor
        const rightOffset = playerRect.right - buttonRect.right;
        const bottomOffset = playerRect.bottom - buttonRect.bottom;
        
        setAudioMenuPosition({
          right: rightOffset - 8, // -8px para ajuste fino
          bottom: bottomOffset + 80 // +80px para aparecer arriba del botón
        });
        
        logger.log('🎧 [AUDIO-MENU] Posición calculada:', { rightOffset, bottomOffset });
      }
    };

    calculateMenuPosition();
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Cerrar si el click NO es en el botón de audio ni en el menú
      if (!target.closest('.vjs-audio-selector-button') && !target.closest('[data-audio-menu]')) {
        setShowAudioMenu(false);
      }
    };

    // Agregar listener con un pequeño delay para evitar que se cierre inmediatamente
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showAudioMenu]);
  
  // Reportar tiempo actual al callback (útil para admin panel)
  useEffect(() => {
    if (onTimeUpdate && currentTime > 0) {
      onTimeUpdate(currentTime);
    }
  }, [currentTime, onTimeUpdate]);
  
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [showEpisodeSelector, setShowEpisodeSelector] = useState(false);
  const lastSavedRef = useRef<number>(0);
  const [overlayContainer, setOverlayContainer] = useState<HTMLElement | null>(null);

  
  // Función para obtener el contenedor de portal dinámico (igual que EpisodeSelector)
  const getPortalTarget = (): HTMLElement => {
    const videoJsPlayer = document.querySelector('.video-js');
    
    if (videoJsPlayer) {
      // Verificar si Video.js está en pantalla completa
      const isVideoJsFullscreen = videoJsPlayer.classList.contains('vjs-fullscreen');
      
      if (isVideoJsFullscreen) {
        // En pantalla completa de Video.js, buscar el contenedor de overlay
        let overlayContainer = videoJsPlayer.querySelector('.vjs-overlay-container') as HTMLElement;
        if (!overlayContainer) {
          // Crear el contenedor si no existe
          overlayContainer = document.createElement('div');
          overlayContainer.className = 'vjs-overlay-container';
          overlayContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 2100;
            pointer-events: none;
          `;
          videoJsPlayer.appendChild(overlayContainer);
        }
        return overlayContainer;
      }
    }
    
    // Por defecto, usar document.body para modo normal
    return document.body;
  };
  const isInitializedRef = useRef(false);
  const currentMagnetRef = useRef<string>('');
  
  // Flag adicional para prevenir múltiples inicializaciones simultáneas
  const isStreamingInProgressRef = useRef(false);

  // Hook de streaming de torrents
  const {
    isLoading: streamLoading,
    torrentInfo,
    streamUrl,
    streamId,
    selectedFileIndex,
    startStreaming,
    stopStreaming,
    selectFile,
    sendHeartbeat,
  } = useTorrentStream({
    onError: (err) => {
      setError(err);
      if (onError) onError(err);
    },
  });

  // ✨ OPTIMIZACIÓN: Reproducción INMEDIATA - subtítulos se cargan en paralelo
  const [isWaitingForHash, setIsWaitingForHash] = useState(false);
  const [isWaitingForSubtitles, setIsWaitingForSubtitles] = useState(false);
  // CRÍTICO: NO bloquear reproducción esperando subtítulos o hash
  const streamUrlForPlayer = streamUrl;

  // Hook de subtítulos (DEBE estar antes de useVideoPlayer para poder pasar availableSubtitles)
  const {
    isSearching: subtitlesSearching,
    availableSubtitles,
    downloadedSubtitles,
    loadExternalSubtitle,
    searchByHash,
    searchByHashDirect,
    searchWyzie,
    downloadSubtitle,
    cleanup: cleanupSubtitles,
  } = useSubtitles({
    onError: (err) => {
      logger.warn('⚠️ [SUBTITLES]', err);
      // No mostramos errores de subtítulos como críticos
    },
  });

  // Ref para mantener availableSubtitles actualizado (evitar closure)
  const availableSubtitlesRef = useRef<any[]>([]);
  useEffect(() => {
    availableSubtitlesRef.current = availableSubtitles;
  }, [availableSubtitles]);

  // Estado para resultados de Subdivx (persistir entre aperturas del modal)
  const [subdivxResults, setSubdivxResults] = useState<any[]>([]);

  // Hook para obtener timings de intro y créditos (DEBE estar antes de useVideoPlayer)
  const {
    introTiming,
    creditsTiming,
    nextEpisodeInfo,
    isLoading: timingsLoading,
    error: timingsError,
  } = useIntroTimings(
    movieMetadata?.tmdbId || tvMetadata?.tmdbId,
    movieMetadata?.season || tvMetadata?.season,
    movieMetadata?.episode || tvMetadata?.episode
  );

  // Guardar posición antes de cambiar audio para restaurarla después
  const savedTimeRef = useRef(0);
  const loadConfirmedSubtitlesRef = useRef<(() => void) | null>(null);
  
  useEffect(() => {
    if (audioSwitchKey > 0 && savedTimeRef.current > 0) {
      // Esperar a que el nuevo reproductor esté listo
      const checkAndRestore = setInterval(() => {
        if (playerRef.current && videoRef.current) {
          const duration = playerRef.current.duration();
          if (duration && duration > 0) {
            // Restaurar posición
            playerRef.current.currentTime(savedTimeRef.current);
            logger.log(`🎧 [AUDIO-SWITCH] Posición restaurada: ${savedTimeRef.current}s`);
            
            // 📝 Recargar subtítulos confirmados
            if (loadConfirmedSubtitlesRef.current) {
              setTimeout(() => {
                logger.log('📝 [AUDIO-SWITCH] Recargando subtítulos confirmados...');
                loadConfirmedSubtitlesRef.current?.();
              }, 500); // Delay para que el player esté completamente listo
            }
            
            savedTimeRef.current = 0;
            clearInterval(checkAndRestore);
          }
        }
      }, 100);
      
      // Timeout de seguridad
      setTimeout(() => clearInterval(checkAndRestore), 5000);
    }
  }, [audioSwitchKey]);

  // Helper: wrappear customStreamUrl con el proxy
  const getProxiedCustomStreamUrl = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    
    logger.log(`🔍 [PROXY-HELPER] Input URL: ${url.substring(0, 80)}`);
    
    // Si ya está proxificado (cualquier tipo de proxy), devolver tal cual
    if (url.startsWith('/api/cors-proxy') || url.startsWith('/api/vidify-proxy') || url.startsWith('/api/vidlink-proxy') || url.startsWith('/api/hls-browser-proxy')) {
      logger.log(`✅ [PROXY-HELPER] Ya proxificado, devolviendo tal cual`);
      return url;
    }
    
    // Si es una URL externa, wrappearla con el proxy correcto
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        
        // 🔍 Detectar si es un stream de Cuevana (o dominios conocidos de players)
        const isCuevanaPlayer = hostname.includes('embed69') || 
                                hostname.includes('xupalace') || 
                                hostname.includes('kinej') ||
                                hostname.includes('player') ||
                                url.includes('.m3u8'); // Cualquier M3U8 externo
        
        if (isCuevanaPlayer) {
          // Usar vidify-proxy (más robusto para M3U8s)
          logger.log(`🎬 [PROXY] Usando vidify-proxy para: ${hostname}`);
          return `/api/vidify-proxy/m3u8?url=${encodeURIComponent(url)}`;
        } else {
          // Usar cors-proxy para otros casos
          const origin = new URL(url).origin + '/';
          logger.log(`🌐 [PROXY] Usando cors-proxy para: ${hostname}`);
          return `/api/cors-proxy?url=${encodeURIComponent(url)}&ref=${encodeURIComponent(origin)}&forceRef=1`;
        }
      } catch {
        logger.log(`⚠️ [PROXY-HELPER] Error parseando URL, devolviendo original`);
        return url;
      }
    }
    
    logger.log(`✅ [PROXY-HELPER] URL relativa o desconocida, devolviendo tal cual`);
    return url;
  };

  // ⚡ Pre-fetch del stream latino/englishDub para cambio instantáneo
  useEffect(() => {
    if ((!customStreamUrl && !englishDubStreamUrl) || selectedAudio !== 'original') return;

    const prefetchAlternativeStreams = async () => {
      // ⚠️ TEMPORALMENTE DESHABILITADO para debug de performance
      logger.log('⏸️ [PREFETCH] Prefetch temporalmente deshabilitado');
      return;
    };

    // Esperar 2 segundos antes de empezar a pre-cargar (para no interferir con el stream principal)
    const timer = setTimeout(prefetchAlternativeStreams, 2000);
    return () => clearTimeout(timer);
  }, [customStreamUrl, englishDubStreamUrl, selectedAudio]);

  // Hook del reproductor de video - Usar useMemo para evitar re-cálculos infinitos
  const computedStreamUrl = useMemo(() => {
    const result = selectedAudio === 'latino' && customStreamUrl 
      ? getProxiedCustomStreamUrl(customStreamUrl) as string 
      : selectedAudio === 'englishDub' && englishDubStreamUrl
        ? getProxiedCustomStreamUrl(englishDubStreamUrl) as string // También proxificar English Dub
        : directStreamUrl
          ? (directStreamUrl.startsWith('http://') || directStreamUrl.startsWith('https://'))
            ? getProxiedCustomStreamUrl(directStreamUrl) as string // Proxificar URLs directas (anime)
            : directStreamUrl // URLs relativas (vidlink) no necesitan proxy
          : (goFileUrl || streamUrlForPlayer || null); // Fallback final
    
    logger.log('🎬 [STREAM-URL-COMPUTED] URL calculada:', {
      selectedAudio,
      hasCustomStreamUrl: !!customStreamUrl,
      result: result?.substring(0, 100) + '...'
    });
    
    return result;
  }, [selectedAudio, customStreamUrl, englishDubStreamUrl, directStreamUrl, goFileUrl, streamUrlForPlayer]);
  
  const {
    videoRef,
    playerRef,
    playerState,
    addSubtitle,
    addSubtitleFromUrl,
    closeSubtitleSettings,
    applySubtitleSettings,
    loadConfirmedSubtitles,
  } = useVideoPlayer({
    streamUrl: computedStreamUrl,
    videoDuration, // Pasar duración del servidor
    movieTitle: movieMetadata?.title || tvMetadata?.title,
    moviePoster: movieMetadata?.backdropPath,
    logoPath: movieMetadata?.logoPath,
    year: movieMetadata?.year,
    rating: movieMetadata?.rating,
    overview: movieMetadata?.overview,
    season: movieMetadata?.season || tvMetadata?.season, // Temporada para el overlay
    episode: movieMetadata?.episode || tvMetadata?.episode, // Episodio para el overlay
    episodeTitle: movieMetadata?.episodeTitle, // Título del episodio para el overlay
    availableSubtitles, // Pasar subtítulos de búsqueda automática
    getAvailableSubtitles: () => availableSubtitlesRef.current, // Función para obtener subtítulos dinámicamente desde ref
    subdivxResults, // Resultados de Subdivx persistentes
    onSubdivxResultsChange: setSubdivxResults, // Callback para actualizar resultados de Subdivx
    customStreamUrl, // Pasar custom stream URL para crear botón
    englishDubStreamUrl, // Pasar English Dub stream URL para crear botón
    onToggleAudioMenu: () => setShowAudioMenu((prev) => !prev), // Toggle del menú de audio
    onClose, // Pasar el callback para cerrar el reproductor
    onError: (err) => {
      setError(err);
      if (onError) onError(err);
    },
    onReady: () => {
      logger.log('✅ [PLAYER-READY-CALLBACK] Reproductor listo, activando flag isPlayerReady', {
        currentIsPlayerReady: isPlayerReady,
        goFileUrl: !!goFileUrl,
        directStreamUrl: !!directStreamUrl,
        magnetUri: !!magnetUri,
        hasPlayer: !!playerRef.current,
      });
      setError(null);
      setIsPlayerReady(true);
      logger.log('✅ [PLAYER-READY-CALLBACK] setIsPlayerReady(true) ejecutado');
      
      // Buscar el contenedor de overlays de Video.js
      if (playerRef.current) {
        const container = playerRef.current.el().querySelector('.vjs-overlay-container');
        if (container) {
          setOverlayContainer(container as HTMLElement);
          logger.log('✅ [OVERLAY] Contenedor de overlays encontrado');
        } else {
          logger.warn('⚠️ [OVERLAY] No se encontró el contenedor de overlays');
        }
      }

      // Intentar autoplay; si el navegador lo bloquea, volver a intentar en silencioso
      try {
        if (playerRef.current && typeof playerRef.current.play === 'function') {
          const p = playerRef.current.play();
          if (p && typeof (p as Promise<any>).then === 'function') {
            (p as Promise<any>).catch(() => {
              try {
                playerRef.current?.muted(true);
                playerRef.current?.play()?.catch(() => {});
              } catch {}
            });
          }
        }
      } catch {}
    },
    onEpisodeButtonClick: () => {
      setShowEpisodeSelector(true);
    },
    showEpisodeButton: !!(tvMetadata?.tmdbId && tvMetadata?.season), // Solo mostrar para series
    onNextEpisodeClick: async () => {
      if (onEpisodeSelect) {
        // Si tenemos nextEpisodeInfo de intro-timings, usarlo (ya incluye cambio de temporada)
        if (nextEpisodeInfo) {
          logger.log(`⏭️ [NEXT-EPISODE] Cambiando a S${nextEpisodeInfo.season}E${nextEpisodeInfo.episode} (desde intro-timings)`);
          onEpisodeSelect(nextEpisodeInfo.season, nextEpisodeInfo.episode, {});
        } 
        // Si no, calcular el siguiente episodio consultando TMDB
        else if (tvMetadata?.tmdbId && tvMetadata?.season && tvMetadata?.episode) {
          try {
            // Obtener datos de la temporada actual
            const seasonRes = await fetch(`/api/tv/${tvMetadata.tmdbId}/season/${tvMetadata.season}`);
            if (seasonRes.ok) {
              const seasonData = await seasonRes.json();
              const currentEpIndex = seasonData.episodes?.findIndex((ep: any) => ep.episode_number === tvMetadata.episode);
              
              // Verificar si hay siguiente episodio en esta temporada
              if (currentEpIndex !== -1 && currentEpIndex < seasonData.episodes.length - 1) {
                const nextEp = tvMetadata.episode + 1;
                logger.log(`⏭️ [NEXT-EPISODE] Cambiando a S${tvMetadata.season}E${nextEp} (mismo temporada)`);
                onEpisodeSelect(tvMetadata.season, nextEp, {});
              } else {
                // Es el último episodio de la temporada, intentar siguiente temporada
                const tvRes = await fetch(`/api/tv/${tvMetadata.tmdbId}`);
                if (tvRes.ok) {
                  const tvData = await tvRes.json();
                  const currentSeason = tvMetadata.season!; // Ya verificamos que existe arriba
                  const nextSeason = tvData.seasons?.find((s: any) => s.season_number === currentSeason + 1);
                  
                  if (nextSeason && (nextSeason.episode_count ?? 0) > 0) {
                    logger.log(`⏭️ [NEXT-EPISODE] Cambiando a S${currentSeason + 1}E1 (siguiente temporada)`);
                    onEpisodeSelect(currentSeason + 1, 1, {});
                  } else {
                    logger.warn('⏭️ [NEXT-EPISODE] No hay siguiente temporada disponible');
                  }
                }
              }
            }
          } catch (error) {
            logger.error('❌ [NEXT-EPISODE] Error calculando siguiente episodio:', error);
            // Fallback: solo sumar 1 al episodio actual
            const nextEp = tvMetadata.episode + 1;
            logger.log(`⏭️ [NEXT-EPISODE] Fallback: Cambiando a S${tvMetadata.season}E${nextEp}`);
            onEpisodeSelect(tvMetadata.season, nextEp, {});
          }
        }
      }
    },
    showNextEpisodeButton: (() => {
      // Priorizar el prop hasNextEpisode que viene del padre con datos reales de TMDB
      const shouldShow = hasNextEpisode || !!nextEpisodeInfo;
      // logger.log('🔍 [NEXT-EPISODE-BUTTON] hasNextEpisode:', hasNextEpisode, 'nextEpisodeInfo:', nextEpisodeInfo, 'showNextEpisodeButton:', shouldShow); // COMENTADO: Floodea la consola
      return shouldShow;
    })(), // Mostrar si hay siguiente episodio
    onTimeUpdate: (time) => {
      setCurrentTime(time);

      // Guardado por evento: throttle a 10s para evitar micro-stuttering
      const now = Date.now();
      if (now - lastSavedRef.current >= 10000) { // Aumentado de 5s a 10s
        // Leer duración directamente del player para evitar desfasajes
        const liveDuration = playerRef.current?.duration?.() ?? playerState.duration ?? 0;
        const mediaType = movieMetadata?.season ? 'tv' : 'movie';
        const tmdbId = movieMetadata?.tmdbId || tvMetadata?.tmdbId || 0;

        const isValidTmdbId = tmdbId && (
          (typeof tmdbId === 'number' && tmdbId > 0) ||
          (typeof tmdbId === 'string' && tmdbId.trim() !== '' && tmdbId !== '0')
        );

        if (isValidTmdbId && liveDuration > 0 && time > 0) {
          // OPTIMIZADO: No loguear cada guardado para evitar overhead
          // logger.log(`💾 [WATCH HISTORY] (event) ${mediaType}-${tmdbId} ${(time/liveDuration*100).toFixed(1)}%`);
          
          // OPTIMIZADO: Usar backdrop ya cargado en lugar de fetch cada vez
          // El stillPath se obtiene una vez cuando se carga el componente, no en cada guardado
          const backdropToUse = movieMetadata?.backdropPath;
          
          // Guardar progreso SIN fetch - usar datos ya disponibles
          watchHistory.saveProgress(
            mediaType,
            tmdbId.toString(),
            time,
            liveDuration,
            {
              title: movieMetadata?.title || tvMetadata?.title,
              season: movieMetadata?.season || tvMetadata?.season,
              episode: movieMetadata?.episode || tvMetadata?.episode,
              posterPath: undefined,
              backdropPath: backdropToUse,
              stillPath: undefined, // No obtener stillPath dinámicamente para evitar fetch
            }
          );
          
          lastSavedRef.current = now;
        }
      }
    },
    // Nuevas props para carga automática de subtítulos confirmados
    imdbId: movieMetadata?.imdbId,
    tmdbId: movieMetadata?.tmdbId || tvMetadata?.tmdbId,
    isTV: !!(tvMetadata?.tmdbId || movieMetadata?.season), // Es TV si tiene tvMetadata o season
    movieHash: torrentInfo?.hash, // Hash del torrent para identificación única
  });

  // Mantener controles visibles mientras el modal de episodios está abierto
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    let interval: ReturnType<typeof setInterval> | undefined;

    if (showEpisodeSelector) {
      // Forzar controles visibles continuamente
      player.userActive(true);
      
      // Mantener activo cada 100ms
      interval = setInterval(() => {
        if (player) {
          player.userActive(true);
        }
      }, 100);
      
      logger.log('🎛️ [EPISODE-SELECTOR] Controles forzados visibles');
    } else {
      // Restaurar comportamiento normal
      player.userActive(false);
      logger.log('🎛️ [EPISODE-SELECTOR] Controles restaurados a comportamiento normal');
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [showEpisodeSelector, playerRef]);

  // Asignar loadConfirmedSubtitles al ref para usarlo en el useEffect de audio switch
  useEffect(() => {
    loadConfirmedSubtitlesRef.current = loadConfirmedSubtitles;
  }, [loadConfirmedSubtitles]);

  // Watch Party: Conectar al socket cuando hay roomId
  useEffect(() => {
    console.log('🔍 [WATCH-PARTY-DEBUG] useEffect ejecutado con:', {
      watchPartyRoomId,
      watchPartyUsername,
      hasPlayerRef: !!playerRef.current
    });
    
    if (!watchPartyRoomId || !watchPartyUsername) {
      console.log('⚠️ [WATCH-PARTY-DEBUG] No hay roomId o username, saliendo');
      return;
    }
    
    logger.log(`🎉 [WATCH-PARTY] Conectando a sala: ${watchPartyRoomId} como ${watchPartyUsername}`);
    
    const newSocket = io('https://watchparty.cineparatodos.lat', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    
    newSocket.on('connect', () => {
      logger.log('✅ [WATCH-PARTY] Socket conectado');
      newSocket.emit('join-room', {
        roomId: watchPartyRoomId,
        username: watchPartyUsername
      });
      setIsWatchPartyActive(true);
      setShowWatchPartyChat(true);
    });
    
    newSocket.on('room-joined', (data: any) => {
      logger.log(`✅ [WATCH-PARTY] Unido a sala:`, data);
      console.log('📊 [WATCH-PARTY] Usuarios recibidos:', data.users);
      setWatchPartyUsers(data.users || []);
      setWatchPartyMessages(data.messages || []);
      
      // NO sincronizar aquí - esperar a que 'user-joined' del host envíe el tiempo actual
    });
    
    newSocket.on('user-joined', (data: any) => {
      logger.log(`👤 [WATCH-PARTY] Usuario ${data.username} se unió`);
      console.log('📊 [WATCH-PARTY] Usuarios actualizados:', data.users);
      setWatchPartyUsers(data.users || []);
      
      // Solo sincronizar si NO soy yo el que acaba de unirse
      if (data.username !== watchPartyUsername) {
        // Esperar 1.5 segundos para que el nuevo usuario tenga su player listo
        setTimeout(() => {
          // Si estoy reproduciendo, enviar mi tiempo actual para sincronizar
          if (playerRef.current && videoRef.current && !videoRef.current.paused) {
            const currentTime = videoRef.current.currentTime;
            logger.log(`🔄 [WATCH-PARTY] Sincronizando nuevo usuario ${data.username} con tiempo: ${currentTime.toFixed(2)}s`);
            
            // Activar flag para evitar loops
            isSyncingRef.current = true;
            
            // Enviar el tiempo actual para que el nuevo usuario se sincronice
            newSocket.emit('video-seek', {
              roomId: watchPartyRoomId,
              currentTime: currentTime
            });
            
            // También enviar play si está reproduciéndose
            newSocket.emit('video-play', {
              roomId: watchPartyRoomId,
              currentTime: currentTime
            });
            
            // Desactivar flag después de un tiempo prudencial
            setTimeout(() => {
              isSyncingRef.current = false;
            }, 800);
          }
        }, 1500);
      }
    });
    
    newSocket.on('user-left', (data: any) => {
      logger.log(`👋 [WATCH-PARTY] Usuario ${data.username} salió`);
      console.log('📊 [WATCH-PARTY] Usuarios restantes:', data.users);
      setWatchPartyUsers(data.users || []);
    });
    
    newSocket.on('user-list', (data: any) => {
      console.log('📊 [WATCH-PARTY] Lista de usuarios actualizada:', data.users);
      setWatchPartyUsers(data.users || []);
    });
    
    newSocket.on('video-play', (data: any) => {
      console.log('📥 [WATCH-PARTY] Recibido video-play:', data);
      if (playerRef.current && !isSyncingRef.current) {
        isSyncingRef.current = true;
        
        const currentTime = playerRef.current.currentTime() || 0;
        const timeDiff = Math.abs(currentTime - data.currentTime);
        
        // Solo hacer seek si la diferencia es mayor a 2 segundos
        if (timeDiff > 2) {
          logger.log(`🔄 [WATCH-PARTY] Sincronizando tiempo: ${currentTime}s → ${data.currentTime}s (diff: ${timeDiff.toFixed(2)}s)`);
          playerRef.current.currentTime(data.currentTime);
        }
        
        if (playerRef.current.paused()) {
          logger.log(`▶️ [WATCH-PARTY] Reproduciendo (sincronizado)`);
          playerRef.current.play()?.catch(e => logger.error('Error playing:', e));
        }
        
        setTimeout(() => { isSyncingRef.current = false; }, 500);
      }
    });
    
    newSocket.on('video-pause', (data: any) => {
      console.log('📥 [WATCH-PARTY] Recibido video-pause:', data);
      if (playerRef.current && !isSyncingRef.current) {
        isSyncingRef.current = true;
        
        const currentTime = playerRef.current.currentTime() || 0;
        const timeDiff = Math.abs(currentTime - data.currentTime);
        
        // Solo hacer seek si la diferencia es mayor a 2 segundos
        if (timeDiff > 2) {
          logger.log(`🔄 [WATCH-PARTY] Sincronizando tiempo: ${currentTime}s → ${data.currentTime}s (diff: ${timeDiff.toFixed(2)}s)`);
          playerRef.current.currentTime(data.currentTime);
        }
        
        if (!playerRef.current.paused()) {
          logger.log(`⏸️ [WATCH-PARTY] Pausando (sincronizado)`);
          playerRef.current.pause();
        }
        
        setTimeout(() => { isSyncingRef.current = false; }, 500);
      }
    });
    
    newSocket.on('video-seek', (data: any) => {
      console.log('📥 [WATCH-PARTY] Recibido video-seek:', data);
      if (playerRef.current && !isSyncingRef.current) {
        isSyncingRef.current = true;
        logger.log(`⏩ [WATCH-PARTY] Sincronizando seek a: ${data.currentTime}s`);
        playerRef.current.currentTime(data.currentTime);
        setTimeout(() => { isSyncingRef.current = false; }, 500);
      }
    });
    
    newSocket.on('video-state', (state: any) => {
      // Sincronización genérica como fallback
      console.log('📥 [WATCH-PARTY] Recibido video-state:', state);
      if (!state.isHost && playerRef.current) {
        const currentTime = playerRef.current.currentTime() || 0;
        const timeDiff = Math.abs(currentTime - state.currentTime);
        
        if (timeDiff > 2) {
          logger.log(`🔄 [WATCH-PARTY] Sincronizando tiempo: ${currentTime}s → ${state.currentTime}s`);
          playerRef.current.currentTime(state.currentTime);
        }
        
        const isPaused = playerRef.current.paused();
        if (state.isPlaying && isPaused) {
          logger.log(`▶️ [WATCH-PARTY] Reproduciendo (sincronizado)`);
          playerRef.current.play()?.catch(e => logger.error('Error playing:', e));
        } else if (!state.isPlaying && !isPaused) {
          logger.log(`⏸️ [WATCH-PARTY] Pausando (sincronizado)`);
          playerRef.current.pause();
        }
      }
    });
    
    newSocket.on('chat-message', (message: any) => {
      logger.log(`💬 [WATCH-PARTY] ${message.user}: ${message.message}`);
      setWatchPartyMessages(prev => [...prev, message]);
    });
    
    newSocket.on('error', (error: any) => {
      const errorMsg = typeof error === 'string' ? error : error?.message || 'Error desconocido';
      logger.error(`❌ [WATCH-PARTY] Error:`, errorMsg);
      setWatchPartyError(errorMsg);
    });
    
    // Socket.io error genérico (diferente al evento 'error' custom)
    newSocket.on('connect_error', (err: any) => {
      logger.error(`❌ [WATCH-PARTY] Error de conexión:`, err.message);
      setWatchPartyError(`Error conectando al servidor: ${err.message}`);
    });
    
    setSocket(newSocket);
    
    return () => {
      logger.log('🔌 [WATCH-PARTY] Desconectando socket');
      newSocket.disconnect();
    };
  }, [watchPartyRoomId, watchPartyUsername]);
  
  // Watch Party: Enviar eventos del player al socket
  useEffect(() => {
    console.log('🔍 [WATCH-PARTY-EVENTS-DEBUG] useEffect ejecutado con:', {
      hasSocket: !!socket,
      watchPartyRoomId,
      hasPlayerRef: !!playerRef.current,
      isPlayerReady
    });
    
    if (!socket || !watchPartyRoomId || !playerRef.current || !isPlayerReady) {
      console.log('⚠️ [WATCH-PARTY-EVENTS-DEBUG] Faltan dependencias, saliendo');
      return;
    }
    
    const player = playerRef.current;
    console.log('✅ [WATCH-PARTY-EVENTS-DEBUG] Registrando listeners de video');
    
    const handlePlay = () => {
      if (isSyncingRef.current) {
        console.log('🔇 [WATCH-PARTY] Ignorando play (estamos sincronizando)');
        return;
      }
      const currentTime = player.currentTime() || 0;
      logger.log(`▶️ [WATCH-PARTY] Emitiendo play: ${currentTime}s`);
      socket.emit('video-play', { roomId: watchPartyRoomId, currentTime });
    };
    
    const handlePause = () => {
      if (isSyncingRef.current) {
        console.log('🔇 [WATCH-PARTY] Ignorando pause (estamos sincronizando)');
        return;
      }
      const currentTime = player.currentTime() || 0;
      logger.log(`⏸️ [WATCH-PARTY] Emitiendo pause: ${currentTime}s`);
      socket.emit('video-pause', { roomId: watchPartyRoomId, currentTime });
    };
    
    const handleSeeked = () => {
      if (isSyncingRef.current) {
        console.log('🔇 [WATCH-PARTY] Ignorando seek (estamos sincronizando)');
        return;
      }
      const currentTime = player.currentTime() || 0;
      logger.log(`⏩ [WATCH-PARTY] Emitiendo seek: ${currentTime}s`);
      socket.emit('video-seek', { roomId: watchPartyRoomId, currentTime });
    };
    
    // Registrar listeners
    player.on('play', handlePlay);
    player.on('pause', handlePause);
    player.on('seeked', handleSeeked);
    
    return () => {
      console.log('🧹 [WATCH-PARTY-EVENTS-DEBUG] Limpiando listeners de video');
      player.off('play', handlePlay);
      player.off('pause', handlePause);
      player.off('seeked', handleSeeked);
    };
  }, [socket, watchPartyRoomId, isPlayerReady]);

  // Guardar progreso en localStorage (Continue Watching)
  // El guardado principal se ejecuta en onTimeUpdate con throttle.
  // Mantenemos este efecto vacío para futuras ampliaciones si hiciera falta.
  useEffect(() => {
    // noop
  }, []);

  // Limpiar subtítulos del reproductor
  const cleanupSubtitlesFromPlayer = () => {
    if (playerRef.current) {
      const textTracks = playerRef.current.textTracks();
      // Iterar sobre TextTrackList usando el método correcto de Video.js
      const tracksToRemove: any[] = [];
      
      // Primero recopilar las pistas que necesitan ser removidas
      // Usar getTrackById() o iterar de manera compatible con Video.js
      const trackCount = (textTracks as any).length || 0;
      for (let i = 0; i < trackCount; i++) {
        const track = (textTracks as any)[i];
        if (track && track.label && track.label.includes('OpenSubtitles')) {
          tracksToRemove.push(track);
        }
      }
      
      // Luego remover las pistas recopiladas
      tracksToRemove.forEach(track => {
        playerRef.current?.removeRemoteTextTrack(track);
      });
      
      addedSubtitlesRef.current.clear();
    }
  };

  // Iniciar streaming cuando se monta el componente
  useEffect(() => {
    logger.log('🔄 [STREAMING-EFFECT] useEffect ejecutado', {
      hasGoFileUrl: !!goFileUrl,
      hasDirectStreamUrl: !!directStreamUrl,
      hasCustomStreamUrl: !!customStreamUrl,
      hasMagnetUri: !!magnetUri,
      currentMagnet: currentMagnetRef.current,
      isInitialized: isInitializedRef.current,
      isStreamingInProgress: isStreamingInProgressRef.current,
      isPlayerReady,
    });

    // Si tenemos goFileUrl, no necesitamos inicializar torrent streaming
    if (goFileUrl) {
      logger.log('🎬 [GOFILE] Reproduciendo archivo de GoFile directamente');
      // setIsPlayerReady(false); // DESHABILITADO: Causaba backdrop negro en Continuar viendo
      
      // Para GoFile, activar búsqueda de subtítulos usando Wyzie inmediatamente
      if (!searchAttemptedRef.current && movieMetadata && (movieMetadata.imdbId || movieMetadata.tmdbId)) {
        logger.log('🔍 [GOFILE-SUBTITLES] Iniciando búsqueda automática de subtítulos con Wyzie...');
        searchAttemptedRef.current = true; // Marcar que ya se intentó
        
        searchWyzie({
          imdbId: movieMetadata?.imdbId,
          tmdbId: movieMetadata?.tmdbId,
          title: movieMetadata?.title,
          season: movieMetadata?.season,
          episode: movieMetadata?.episode,
        })
          .then((subs) => {
            logger.log(`✅ [GOFILE-SUBTITLES] ${subs.length} subtítulos descargados desde Wyzie`);
          })
          .catch(err => {
            logger.warn(`⚠️ [GOFILE-SUBTITLES] Error buscando en Wyzie:`, err);
          });
      }
      
      return;
    }

    // Si tenemos URL directa (proxy/HLS) o customStreamUrl, disparar búsqueda de subtítulos con Wyzie
    if (directStreamUrl || customStreamUrl) {
      const streamType = directStreamUrl ? 'DIRECT' : 'CUSTOM';
      logger.log(`🎬 [${streamType}] Reproduciendo desde URL ${directStreamUrl ? 'directa (proxy/HLS)' : 'personalizada (Latino/English Dub)'}`);
      // setIsPlayerReady(false); // DESHABILITADO: Causaba backdrop negro en Continuar viendo

      if (!searchAttemptedRef.current && movieMetadata && (movieMetadata.imdbId || movieMetadata.tmdbId)) {
        logger.log(`🔍 [${streamType}-SUBTITLES] Iniciando búsqueda automática de subtítulos con Wyzie...`);
        searchAttemptedRef.current = true;

        searchWyzie({
          imdbId: movieMetadata?.imdbId,
          tmdbId: movieMetadata?.tmdbId,
          title: movieMetadata?.title,
          season: movieMetadata?.season,
          episode: movieMetadata?.episode,
        })
          .then((subs) => {
            logger.log(`✅ [${streamType}-SUBTITLES] ${subs.length} subtítulos descargados desde Wyzie`);
          })
          .catch(err => {
            logger.warn(`⚠️ [${streamType}-SUBTITLES] Error buscando en Wyzie:`, err);
          });
      }

      return;
    }

    // Evitar llamadas duplicadas en StrictMode y múltiples inicializaciones
    if (!magnetUri || currentMagnetRef.current === magnetUri || isStreamingInProgressRef.current) {
      return;
    }

    // Marcar como en progreso
    isStreamingInProgressRef.current = true;

    // Preparar info del episodio si es una serie
    const episodeInfo = (movieMetadata?.season && movieMetadata?.episode)
      ? { season: movieMetadata.season, episode: movieMetadata.episode }
      : undefined;

    // Si ya hay un streaming en curso, esperar a que termine
    if (isInitializedRef.current) {
      logger.log('⏳ [STREAMING] Esperando limpieza anterior...');
      stopStreaming().then(() => {
        logger.log('✅ [STREAMING] Limpieza completada, iniciando nuevo stream');
        currentMagnetRef.current = magnetUri;
        startStreaming(magnetUri, episodeInfo, movieMetadata).finally(() => {
          isStreamingInProgressRef.current = false;
        });
      });
    } else {
      logger.log('🚀 [STREAMING] Iniciando primer stream');
      isInitializedRef.current = true;
      currentMagnetRef.current = magnetUri;
      startStreaming(magnetUri, episodeInfo, movieMetadata).finally(() => {
        isStreamingInProgressRef.current = false;
      });
    }

    return () => {
      // Cleanup al desmontar
      logger.log('🧹 [STREAMING-CLEANUP] Ejecutando cleanup', {
        hasGoFileUrl: !!goFileUrl,
        hasDirectStreamUrl: !!directStreamUrl,
        hasCustomStreamUrl: !!customStreamUrl,
        hasMagnetUri: !!magnetUri,
        currentMagnet: currentMagnetRef.current,
        isPlayerReady,
      });
      
      // NO resetear refs si es el mismo contenido (React Strict Mode puede desmontar/remontar)
      // Solo limpiar si realmente cambió el contenido
      const isSameMagnet = magnetUri && currentMagnetRef.current === magnetUri;
      const isSameContent = isSameMagnet || goFileUrl || directStreamUrl || customStreamUrl; // Si hay goFileUrl, directStreamUrl o customStreamUrl, no limpiar
      
      if (!isSameContent) {
        logger.log('🧹 [STREAMING-CLEANUP] Limpiando stream anterior (contenido cambió o se desmontó definitivamente)');
        stopStreaming();
        isInitializedRef.current = false;
        currentMagnetRef.current = '';
        isStreamingInProgressRef.current = false;
      } else {
        logger.log('⏭️ [STREAMING-CLEANUP] Manteniendo stream actual (mismo contenido, probablemente React Strict Mode)');
      }
      
      cleanupSubtitles();
      cleanupSubtitlesFromPlayer();
      // setIsPlayerReady(false); // DESHABILITADO: Causaba backdrop negro al cambiar de episodio
      addedSubtitlesRef.current.clear();
      logger.log('✅ [STREAMING-CLEANUP] Cleanup completado');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magnetUri, goFileUrl, directStreamUrl, customStreamUrl]);

  // ✨ OPTIMIZACIÓN: No bloquear reproductor esperando hash - buscar subtítulos en paralelo
  useEffect(() => {
    if (streamUrl && !movieHash) {
      logger.log('🔍 [HASH] Calculando hash en paralelo, reproductor iniciará inmediatamente...');
      // No activar isWaitingForHash - permitir reproducción inmediata
    }
  }, [streamUrl, movieHash]);

  // Resetear isPlayerReady cuando cambia el streamUrl (nuevo player)
  // DESHABILITADO: Esto causaba que el backdrop reapareciera en "Continuar viendo"
  // useEffect(() => {
  //   if (streamUrlForPlayer) {
  //     logger.log('🔄 [PLAYER] Nuevo streamUrl, reseteando isPlayerReady');
  //     setIsPlayerReady(false);
  //   }
  // }, [streamUrlForPlayer]);

  // Obtener duración y hash del video desde el servidor
  useEffect(() => {
    if (streamId && !videoDuration) {
      logger.log(`⏳ [INFO] Obteniendo info del servidor para streamId: ${streamId}...`);
      
      const fetchUrl = `/api/stream/${streamId}/info`;
      logger.log(`🔗 [INFO] URL: ${fetchUrl}`);
      
      fetch(fetchUrl)
        .then(res => {
          logger.log(`📡 [INFO] Status: ${res.status}`);
          return res.json();
        })
        .then(data => {
          logger.log(`📊 [INFO] Datos recibidos:`, data);
          
          // Actualizar duración
          if (data.videoDuration && data.videoDuration > 0) {
            logger.log(`✅ [DURATION] Duración obtenida: ${data.videoDuration}s (${Math.floor(data.videoDuration / 60)}min)`);
            setVideoDuration(data.videoDuration);
          } else {
            logger.warn('⚠️ [DURATION] Duración no disponible aún (null o 0), reintentando en 5s...');
            // Reintentar después de 5 segundos (dar tiempo a que se calcule)
            setTimeout(() => {
              logger.log(`🔄 [INFO] Reintentando obtener info...`);
              fetch(fetchUrl)
                .then(res => res.json())
                .then(retryData => {
                  logger.log(`📊 [INFO] Datos recibidos (reintento):`, retryData);
                  if (retryData.videoDuration && retryData.videoDuration > 0) {
                    logger.log(`✅ [DURATION] Duración obtenida (reintento): ${retryData.videoDuration}s`);
                    setVideoDuration(retryData.videoDuration);
                  } else {
                    logger.warn('⚠️ [DURATION] Duración sigue sin estar disponible después del reintento');
                  }
                  
                  // Actualizar hash también en el reintento
                  if (retryData.movieHash && retryData.movieByteSize) {
                    logger.log(`✅ [HASH] Hash obtenido (reintento): ${retryData.movieHash}`);
                    setMovieHash(retryData.movieHash);
                    setMovieByteSize(retryData.movieByteSize);
                  }
                })
                .catch(err => logger.error('❌ [INFO] Error en reintento:', err));
            }, 5000);
          }
          
          // Actualizar hash si está disponible
          if (data.movieHash && data.movieByteSize) {
            logger.log(`✅ [HASH] Hash de OpenSubtitles obtenido: ${data.movieHash}`);
            setMovieHash(data.movieHash);
            setMovieByteSize(data.movieByteSize);
            // NO bloquear reproducción esperando hash
          } else {
            logger.log(`ℹ️ [HASH] Hash no disponible aún (se está calculando...)`);
            // Reintentar cada 2 segundos hasta tener el hash
            const hashCheckInterval = setInterval(() => {
              fetch(fetchUrl)
                .then(res => res.json())
                .then(checkData => {
                  if (checkData.movieHash && checkData.movieByteSize) {
                    logger.log(`✅ [HASH] Hash obtenido después de espera: ${checkData.movieHash}`);
                    setMovieHash(checkData.movieHash);
                    setMovieByteSize(checkData.movieByteSize);
                    clearInterval(hashCheckInterval);
                  }
                })
                .catch(err => logger.warn('⚠️ [HASH] Error verificando hash:', err));
            }, 2000);
            
            // Timeout máximo de 30 segundos
            setTimeout(() => {
              clearInterval(hashCheckInterval);
              if (!movieHash) {
                logger.warn('⚠️ [HASH] Timeout esperando hash, continuando sin hash');
              }
            }, 30000);
          }
        })
        .catch(err => {
          logger.error('❌ [INFO] Error obteniendo info:', err);
          // Si falla, el reproductor ya está iniciado de todas formas
        });
    }
  }, [streamId, videoDuration, movieHash]);

  // Sistema de heartbeat
  useEffect(() => {
    if (streamId && playerRef.current) {
      const interval = setInterval(() => {
        const isPaused = playerRef.current?.paused() || false;
        const currentTime = playerRef.current?.currentTime() || 0;
        sendHeartbeat(isPaused, currentTime);
      }, 30000); // Cada 30 segundos

      return () => clearInterval(interval);
    }
  }, [streamId, playerRef, sendHeartbeat]);

  // Cargar subtítulo externo
  const handleSubtitleUpload = (file: File) => {
    const subtitle = loadExternalSubtitle(file);
    if (subtitle) {
      addSubtitle(file);
    }
  };

  // Cargar subtítulos externos del torrent
  useEffect(() => {
    if (torrentInfo && torrentInfo.subtitleFiles.length > 0 && streamId) {
      logger.log('📝 [SUBTITLES] Cargando subtítulos externos del torrent...');
      
      torrentInfo.subtitleFiles.forEach((subtitle) => {
        const subtitleUrl = `/api/torrent/subtitle/${streamId}/${subtitle.index}`;
        const languageNames: { [key: string]: string } = {
          'es': 'Español',
          'en': 'English',
          'unknown': 'Desconocido',
        };
        
        const label = `${languageNames[subtitle.language] || subtitle.language} (${subtitle.format.toUpperCase()})`;
        
        addSubtitleFromUrl(subtitleUrl, subtitle.language, label);
      });
    }
  }, [torrentInfo, streamId, addSubtitleFromUrl]);

  // Cargar subtítulos externos (de VidLink, etc.) cuando estén disponibles
  // IMPORTANTE: Se cargan DESPUÉS de que el video ya está reproduciendo para no bloquear la reproducción
  useEffect(() => {
    console.log('🔍 [EXTERNAL-SUBS-DEBUG] useEffect ejecutado:', {
      externalSubtitlesLength: externalSubtitles.length,
      isPlayerReady,
      hasPlayerRef: !!playerRef.current,
      watchPartyActive: !!watchPartyRoomId
    });
    
    if (externalSubtitles.length === 0 || !isPlayerReady || !playerRef.current) {
      console.log('⚠️ [EXTERNAL-SUBS-DEBUG] Saliendo del useEffect');
      return;
    }

    // Mapeo para normalizar idiomas (igual que en useVideoPlayer)
    const languageNormalization: Record<string, string> = {
      'spanish': 'Español', 'español': 'Español', 'spa': 'Español', 'es': 'Español',
      'english': 'English', 'inglés': 'English', 'ingles': 'English', 'eng': 'English', 'en': 'English',
    };
    
    // SOLO cargar subtítulos en español e inglés para acelerar la carga
    const allowedLanguages = ['Español', 'English'];
    
    // Filtrar solo español e inglés
    const filteredSubtitles = externalSubtitles.filter((subtitle) => {
      const rawLang = subtitle.label.replace(/\s+\d+$/, '').trim();
      const normalizedLang = languageNormalization[rawLang.toLowerCase()] || rawLang;
      return allowedLanguages.includes(normalizedLang);
    });
    
    logger.log(`📝 [EXTERNAL-SUBS] Programando carga de ${filteredSubtitles.length} subtítulos (Español/Inglés) DESPUÉS de que empiece a reproducir`);
    
    // Esperar 2 segundos DESPUÉS de que el player está listo para no bloquear la reproducción inicial
    const loadSubtitlesTimeout = setTimeout(() => {
      if (!playerRef.current) return;
      
      logger.log(`📝 [EXTERNAL-SUBS] Cargando subtítulos externos ahora...`);
      
      // Agrupar por idioma normalizado y agregar con números secuenciales
      const groupedByLang: Record<string, typeof externalSubtitles> = {};
      
      filteredSubtitles.forEach((subtitle) => {
        // Extraer idioma base del label
        const rawLang = subtitle.label.replace(/\s+\d+$/, '').trim();
        const normalizedLang = languageNormalization[rawLang.toLowerCase()] || rawLang;
        
        if (!groupedByLang[normalizedLang]) {
          groupedByLang[normalizedLang] = [];
        }
        groupedByLang[normalizedLang].push(subtitle);
      });
      
      // Agregar subtítulos con labels normalizados
      const labelToActivate: string[] = [];
      
      Object.entries(groupedByLang).forEach(([langName, subs]) => {
        subs.forEach((subtitle, index) => {
          const label = subs.length > 1 
            ? `${langName} ${index + 1} (VidLink)` 
            : `${langName} (VidLink)`;
          
          logger.log(`  ➕ Agregando: ${label}`);
          addSubtitleFromUrl(subtitle.url, subtitle.language, label);
          
          // Guardar el primer subtítulo en español para activarlo después
          if (langName === 'Español' && labelToActivate.length === 0) {
            labelToActivate.push(label);
          }
        });
      });
      
      logger.log('✅ [EXTERNAL-SUBS] Subtítulos externos agregados');
      
      // ⚠️ DESACTIVADO: enforceSpanishOnly causa conflictos con ASS
      // El subtítulo español ASS ya se activa automáticamente más arriba
      // No necesitamos forzar la activación de VTT español
    }, 2000); // 2 segundos de delay para no bloquear la reproducción
    
    return () => {
      clearTimeout(loadSubtitlesTimeout);
    };
  }, [externalSubtitles, isPlayerReady, addSubtitleFromUrl]);

  // Ref para evitar múltiples búsquedas del mismo hash
  const searchedHashRef = useRef<string | null>(null);
  // Ref para trackear qué subtítulos ya se agregaron al player
  const addedSubtitlesRef = useRef<Set<string>>(new Set());
  // Ref para trackear si ya se intentó buscar subtítulos sin hash
  const searchAttemptedRef = useRef<boolean>(false);

  // Buscar y agregar subtítulos automáticamente cuando tengamos el hash
  useEffect(() => {
    // Evitar búsquedas duplicadas del mismo hash
    if (movieHash && movieByteSize && streamId && searchedHashRef.current !== movieHash) {
      logger.log(`🔍 [SUBTITLES] Hash disponible: ${movieHash}, buscando subtítulos en paralelo...`);
      searchedHashRef.current = movieHash; // Marcar como buscado
      addedSubtitlesRef.current.clear(); // Limpiar lista de subtítulos agregados para nuevo video
      searchAttemptedRef.current = true; // Marcar que ya se intentó buscar
      
      // ✨ OPTIMIZACIÓN: Iniciar reproducción INMEDIATAMENTE, subtítulos en paralelo
      logger.log(`🚀 [SUBTITLES] Iniciando reproductor y buscando subtítulos en paralelo (sin espera)`);
      
      // Usar Wyzie en lugar de OpenSubtitles directo
      searchWyzie({
        imdbId: movieMetadata?.imdbId,
        tmdbId: movieMetadata?.tmdbId,
        title: movieMetadata?.title,
        season: movieMetadata?.season,
        episode: movieMetadata?.episode,
      })
        .then(() => {
          logger.log(`✅ [SUBTITLES] Búsqueda completada con Wyzie, subtítulos listos para agregar`);
          setIsWaitingForSubtitles(false);
          // Los subtítulos se agregarán automáticamente cuando el player esté ready
        })
        .catch(err => {
          logger.warn(`⚠️ [SUBTITLES] Error en búsqueda automática con Wyzie:`, err);
          setIsWaitingForSubtitles(false);
        });
    }
    // NUEVO: Si no hay hash pero sí streamId y no se ha intentado buscar, intentar con metadata
    else if (streamId && !movieHash && !searchAttemptedRef.current && (movieMetadata?.imdbId || movieMetadata?.tmdbId || movieMetadata?.title)) {
      logger.log(`🔍 [SUBTITLES] Hash no disponible aún, pero intentando búsqueda por metadata...`);
      searchAttemptedRef.current = true; // Marcar que ya se intentó
      
      // Buscar por metadata mientras esperamos el hash usando Wyzie
      searchWyzie({
        imdbId: movieMetadata?.imdbId,
        tmdbId: movieMetadata?.tmdbId,
        title: movieMetadata?.title,
        season: movieMetadata?.season,
        episode: movieMetadata?.episode,
      })
        .then(() => {
          logger.log(`✅ [SUBTITLES] Búsqueda por metadata completada con Wyzie`);
        })
        .catch(err => {
          logger.warn(`⚠️ [SUBTITLES] Error en búsqueda por metadata con Wyzie:`, err);
        });
    }
  }, [movieHash, movieByteSize, streamId, searchWyzie, movieMetadata]);

  // NUEVO: Efecto para reintentar subtítulos cuando el hash llega tardíamente
  useEffect(() => {
    // Si el hash llega después de que ya se intentó buscar sin él, reintentar
    if (movieHash && movieByteSize && streamId && searchAttemptedRef.current && searchedHashRef.current !== movieHash) {
      logger.log(`🔄 [SUBTITLES] Hash llegó tardíamente (${movieHash}), reintentando búsqueda de subtítulos...`);
      
      // Resetear refs para permitir nueva búsqueda
      searchedHashRef.current = null;
      searchAttemptedRef.current = false;
      
      // Trigger del efecto anterior con el nuevo hash
      // (se ejecutará automáticamente por el cambio en movieHash)
    }
  }, [movieHash, movieByteSize, streamId]);

  // Agregar subtítulos descargados de OpenSubtitles al player cuando esté ready
  useEffect(() => {
    logger.log(`🔍 [SUBTITLES-EFFECT] downloadedSubtitles: ${downloadedSubtitles.length}, isPlayerReady: ${isPlayerReady}, playerRef: ${!!playerRef.current}, audioSwitchKey: ${audioSwitchKey}`);
    
    if (downloadedSubtitles.length === 0) return;
    if (!isPlayerReady) {
      logger.warn(`⏳ [SUBTITLES] Player aún no está ready, esperando...`);
      return;
    }

    logger.log(`📝 [SUBTITLES] Player está listo, agregando ${downloadedSubtitles.length} subtítulos al player...`);
    
    let newSubtitlesAdded = false;
    let spanishASSSubtitle: { content: string; label: string } | null = null;
    
    downloadedSubtitles.forEach(subtitle => {
      const subtitleKey = `${subtitle.url}-${subtitle.language}`;
      
      // Solo agregar si no se ha agregado antes
      if (!addedSubtitlesRef.current.has(subtitleKey)) {
        // 🎨 Verificar si es ASS
        const isASS = (subtitle as any).isASS === true;
        
        if (isASS) {
          logger.log(`🎨 [SUBTITLES] Detectado ASS: ${subtitle.languageName || subtitle.language} - ${subtitle.filename}`);
          
          // Agregar como track "subtitles" con VTT dummy para que aparezca en el modal
          const label = `${subtitle.languageName || subtitle.language} - ${subtitle.filename}`;
          const assContent = (subtitle as any).assContent;
          
          if (playerRef.current && assContent) {
            // Crear un VTT con un cue invisible para que Video.js lo considere válido
            // pero no interfiera con el renderizado de SubtitlesOctopus
            const dummyVTT = 'WEBVTT\n\n00:00:00.000 --> 00:00:00.001\n<v Dummy></v>\n\n';
            const dummyBlob = new Blob([dummyVTT], { type: 'text/vtt' });
            const dummyUrl = URL.createObjectURL(dummyBlob);
            
            const track = playerRef.current.addRemoteTextTrack({
              kind: 'subtitles', // Usar 'subtitles' para que aparezca en el menú
              src: dummyUrl, // VTT con cue invisible
              srclang: subtitle.language,
              label: label,
              default: false,
            }, false) as any;
            
            // Guardar referencia del contenido ASS en el track para uso posterior
            if (track && track.track) {
              (track.track as any).assContent = assContent;
              (track.track as any).isASS = true;
            }
            
            logger.log(`✅ [SUBTITLES-ASS] Track ASS agregado (con VTT dummy): ${label}`);
            
            // 🇪🇸 Si es español, guardarlo para activarlo automáticamente
            if (subtitle.language === 'es') {
              spanishASSSubtitle = { content: assContent, label };
              logger.log(`🇪🇸 [SUBTITLES-ASS] Subtítulo español ASS encontrado, se activará automáticamente`);
            }
          }
        } else {
          logger.log(`➕ [SUBTITLES] Agregando: ${subtitle.languageName || subtitle.language} - ${subtitle.filename}`);
          
          // Subtítulo VTT normal
          const label = `${subtitle.languageName || subtitle.language} - ${subtitle.filename}`;
          addSubtitleFromUrl(subtitle.url, subtitle.language, label);
          
          logger.log(`✅ [SUBTITLES] Subtítulo agregado al player: ${label}`);
        }
        
        // Marcar como agregado
        addedSubtitlesRef.current.add(subtitleKey);
        newSubtitlesAdded = true;
      } else {
        logger.log(`⏭️ [SUBTITLES] Subtítulo ya agregado (skip): ${subtitle.languageName || subtitle.language}`);
      }
    });
    
    logger.log(`✅ [SUBTITLES] Todos los subtítulos agregados al player`);
    
    // 🇪🇸 Activar subtítulo español ASS automáticamente
    if (spanishASSSubtitle && playerRef.current) {
      const assData = spanishASSSubtitle as { content: string; label: string };
      logger.log(`🎨 [SUBTITLES-ASS] Activando subtítulo español ASS automáticamente: ${assData.label}`);
      
      // Primero, desactivar todos los tracks
      const textTracks = playerRef.current.textTracks() as any;
      const tracksLength = textTracks.length || 0;
      
      for (let i = 0; i < tracksLength; i++) {
        const track = textTracks[i];
        if (track && (track.kind === 'subtitles' || track.kind === 'captions')) {
          track.mode = 'disabled';
        }
      }
      
      // Buscar el track español ASS y activarlo
      for (let i = 0; i < tracksLength; i++) {
        const track = textTracks[i];
        if (track && track.isASS === true && track.language === 'es') {
          track.mode = 'showing';
          logger.log(`✅ [SUBTITLES-ASS] Track español ASS marcado como 'showing'`);
          break;
        }
      }
      
      // Disparar el evento para que VideoPlayer lo renderice con assjs
      const event = new CustomEvent('ass-subtitle-available', {
        detail: {
          content: assData.content,
          label: assData.label
        }
      });
      window.dispatchEvent(event);
    }
    
    // Si se agregaron nuevos subtítulos, reinicializar botón de configuración y fix de hover
    if (newSubtitlesAdded && playerRef.current) {
      setTimeout(() => {
        logger.log('🔄 [SUBTITLES] Reinicializando controles de subtítulos...');
        
        // 1. Reinicializar botón de configuración del plugin
        const pluginFunc = (playerRef.current as any)?.subtitleSync;
        if (typeof pluginFunc === 'function') {
          const pluginInstance = pluginFunc();
          if (pluginInstance && typeof pluginInstance.addSettingsButton === 'function') {
            logger.log('✅ [SUBTITLES] Reinicializando botón de configuración...');
            pluginInstance.addSettingsButton();
          }
        }
        
        // 2. Reaplicar fix de hover del menú
        const playerEl = playerRef.current?.el();
        if (!playerEl) return;
        
        const subsButton = playerEl.querySelector('.vjs-subs-caps-button, .vjs-subtitles-button, .vjs-captions-button');
        if (!subsButton) return;

        const menu = subsButton.querySelector('.vjs-menu');
        if (!menu) return;

        // Limpiar listeners previos
        const oldListeners = (subsButton as any)._hoverListeners;
        if (oldListeners) {
          subsButton.removeEventListener('mouseenter', oldListeners.buttonEnter);
          subsButton.removeEventListener('mouseleave', oldListeners.buttonLeave);
          menu.removeEventListener('mouseenter', oldListeners.menuEnter);
          menu.removeEventListener('mouseleave', oldListeners.menuLeave);
        }

        let menuTimeout: ReturnType<typeof setTimeout> | null = null;

        const buttonEnter = () => {
          if (menuTimeout) {
            clearTimeout(menuTimeout);
            menuTimeout = null;
          }
          menu.classList.remove('vjs-hidden');
          (menu as HTMLElement).style.display = 'block';
        };

        const buttonLeave = () => {
          menuTimeout = setTimeout(() => {
            if (!menu.matches(':hover')) {
              menu.classList.add('vjs-hidden');
              (menu as HTMLElement).style.display = '';
            }
          }, 500); // Aumentado de 200ms a 500ms
        };

        const menuEnter = () => {
          if (menuTimeout) {
            clearTimeout(menuTimeout);
            menuTimeout = null;
          }
          menu.classList.remove('vjs-hidden');
          (menu as HTMLElement).style.display = 'block';
        };

        const menuLeave = () => {
          menuTimeout = setTimeout(() => {
            menu.classList.add('vjs-hidden');
            (menu as HTMLElement).style.display = '';
          }, 500); // Aumentado de 200ms a 500ms
        };

        subsButton.addEventListener('mouseenter', buttonEnter);
        subsButton.addEventListener('mouseleave', buttonLeave);
        menu.addEventListener('mouseenter', menuEnter);
        menu.addEventListener('mouseleave', menuLeave);

        (subsButton as any)._hoverListeners = {
          buttonEnter,
          buttonLeave,
          menuEnter,
          menuLeave
        };

        logger.log('✅ [SUBTITLES] Fix de hover reaplicado después de agregar subtítulos automáticos');
      }, 1500);
    }
  }, [downloadedSubtitles, isPlayerReady, addSubtitleFromUrl]); // audioSwitchKey NO necesario - se recargan directamente en onClick

  // Controlar opacidad del backdrop según progreso de carga (solo para torrents)
  useEffect(() => {
    if (playerState.isLoading && playerState.progress > 0) {
      // Aumentar opacidad de 50% a 100% según progreso
      const newOpacity = 0.5 + (playerState.progress / 100) * 0.5;
      setPosterOpacity(newOpacity);
    } else if (!playerState.isLoading) {
      // Cuando termine de cargar, fade out completo
      setPosterOpacity(0);
    }
  }, [playerState.isLoading, playerState.progress]);

  // Ocultar título después de 8 segundos cuando empiece a reproducir
  useEffect(() => {
    if (!playerState.isLoading && streamUrl) {
      const timer = setTimeout(() => {
        setShowTitle(false);
      }, 8000);

      return () => clearTimeout(timer);
    }
  }, [playerState.isLoading, streamUrl]);


  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Mensajes de error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg flex-shrink-0">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}


      {/* Selector de archivos (si hay múltiples) */}
      {torrentInfo && torrentInfo.videoFiles.length > 1 && !streamUrl && (
        <div className="bg-gray-900 p-6 rounded-lg">
          <TorrentSelector
            files={torrentInfo.videoFiles}
            selectedIndex={selectedFileIndex}
            onSelectFile={selectFile}
          />
        </div>
      )}

      {/* Reproductor de video */}
      {(streamUrl || goFileUrl || directStreamUrl) && (
        <div className="flex-1 flex flex-col">
          {/* Video player con poster overlay durante carga */}
          <div 
            className={`flex-1 bg-black overflow-hidden relative group ${!isModalPlayer ? 'rounded-lg' : ''}`}
            onMouseEnter={() => setShowTitle(true)}
            onMouseLeave={() => {
              if (!playerState.isLoading) {
                setTimeout(() => setShowTitle(false), 2000);
              }
            }}
          >
            <VideoPlayer key={`player-${selectedAudio}-${audioSwitchKey}`} videoRef={videoRef} />
            
            {/* Botón Volver movido al reproductor */}
            
            {/* Botón Skip Intro */}
            {introTiming && (
              <SkipIntroButton
                currentTime={currentTime}
                introStart={introTiming.start}
                introEnd={introTiming.end}
                onSkip={() => {
                  if (playerRef.current) {
                    playerRef.current.currentTime(introTiming.end);
                    logger.log(`⏩ [SKIP-INTRO] Saltando intro: ${introTiming.start}s → ${introTiming.end}s`);
                  }
                }}
                isFullscreen={isFullscreen}
              />
            )}

            {/* Menú de selección de audio (aparece arriba del botón de audio) */}
            {(customStreamUrl || englishDubStreamUrl) && showAudioMenu && createPortal(
              <div 
                data-audio-menu
                className="fixed z-[9999]"
                style={{
                  bottom: `${audioMenuPosition.bottom}px`,
                  right: `${audioMenuPosition.right}px`
                }}
              >
                <div className="bg-gray-900/98 backdrop-blur-md rounded-lg overflow-hidden shadow-2xl border-2 border-gray-700">
                  {/* ORIGINAL */}
                  <button
                    onClick={() => {
                      if (selectedAudio !== 'original') {
                        // Guardar posición actual
                        if (playerRef.current) {
                          savedTimeRef.current = playerRef.current.currentTime() || 0;
                          logger.log(`🎧 [AUDIO] Guardando posición: ${savedTimeRef.current}s`);
                        }
                        setSelectedAudio('original');
                        setAudioSwitchKey(prev => prev + 1); // Forzar reinicialización
                        logger.log('🎧 [AUDIO] Cambiando a audio original');
                        
                        // 🎯 RECARGAR SUBTÍTULOS
                        if (movieMetadata && (movieMetadata.imdbId || movieMetadata.tmdbId)) {
                          logger.log('🔄 [AUDIO-CHANGE] Recargando subtítulos con Wyzie...');
                          addedSubtitlesRef.current.clear();
                          searchWyzie({
                            imdbId: movieMetadata?.imdbId,
                            tmdbId: movieMetadata?.tmdbId,
                            title: movieMetadata?.title,
                            season: movieMetadata?.season,
                            episode: movieMetadata?.episode,
                          }).catch(err => logger.warn('⚠️ Error recargando subtítulos:', err));
                        }
                      }
                      setShowAudioMenu(false);
                    }}
                    className={`w-full px-6 py-3 text-left text-sm font-semibold transition-all duration-200 flex items-center gap-3 ${
                      selectedAudio === 'original' 
                        ? 'bg-blue-600 text-white shadow-lg' 
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <img 
                      src={`https://flagcdn.com/w40/${getOriginalLanguageInfo(movieMetadata?.originCountries).flagCode}.png`}
                      alt="Flag"
                      className="w-8 h-6 object-cover rounded shadow-md"
                      onError={(e) => {
                        // Fallback si la imagen no carga
                        e.currentTarget.src = '/flags/world.png';
                      }}
                    />
                    <span className="text-base">{getOriginalLanguageInfo(movieMetadata?.originCountries).label}</span>
                  </button>
                  
                  {/* ENGLISH DUB */}
                  {englishDubStreamUrl && (
                    <button
                      onClick={() => {
                        if (selectedAudio !== 'englishDub') {
                          // Guardar posición actual
                          if (playerRef.current) {
                            savedTimeRef.current = playerRef.current.currentTime() || 0;
                            logger.log(`🎧 [AUDIO] Guardando posición: ${savedTimeRef.current}s`);
                          }
                          setSelectedAudio('englishDub');
                          setAudioSwitchKey(prev => prev + 1); // Forzar reinicialización
                          logger.log('🎧 [AUDIO] Cambiando a audio English Dub');
                          
                          // 🎯 RECARGAR SUBTÍTULOS
                          if (movieMetadata && (movieMetadata.imdbId || movieMetadata.tmdbId)) {
                            logger.log('🔄 [AUDIO-CHANGE] Recargando subtítulos con Wyzie...');
                            addedSubtitlesRef.current.clear();
                            searchWyzie({
                              imdbId: movieMetadata?.imdbId,
                              tmdbId: movieMetadata?.tmdbId,
                              title: movieMetadata?.title,
                              season: movieMetadata?.season,
                              episode: movieMetadata?.episode,
                            }).catch(err => logger.warn('⚠️ Error recargando subtítulos:', err));
                          }
                        }
                        setShowAudioMenu(false);
                      }}
                      className={`w-full px-6 py-3 text-left text-sm font-semibold transition-all duration-200 flex items-center gap-3 border-t border-gray-800 ${
                        selectedAudio === 'englishDub' 
                          ? 'bg-blue-600 text-white shadow-lg' 
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <img 
                        src="https://flagcdn.com/w40/us.png"
                        alt="USA Flag"
                        className="w-8 h-6 object-cover rounded shadow-md"
                      />
                      <span className="text-base">ENGLISH</span>
                    </button>
                  )}
                  
                  {/* LATINO */}
                  {customStreamUrl && (
                    <button
                      onClick={() => {
                        if (selectedAudio !== 'latino') {
                          // Guardar posición actual
                          if (playerRef.current) {
                            savedTimeRef.current = playerRef.current.currentTime() || 0;
                            logger.log(`🎧 [AUDIO] Guardando posición: ${savedTimeRef.current}s`);
                          }
                          setSelectedAudio('latino');
                          setAudioSwitchKey(prev => prev + 1); // Forzar reinicialización
                          logger.log('🎧 [AUDIO] Cambiando a audio latino');
                          
                          // 🎯 RECARGAR SUBTÍTULOS
                          if (movieMetadata && (movieMetadata.imdbId || movieMetadata.tmdbId)) {
                            logger.log('🔄 [AUDIO-CHANGE] Recargando subtítulos con Wyzie...');
                            addedSubtitlesRef.current.clear();
                            searchWyzie({
                              imdbId: movieMetadata?.imdbId,
                              tmdbId: movieMetadata?.tmdbId,
                              title: movieMetadata?.title,
                              season: movieMetadata?.season,
                              episode: movieMetadata?.episode,
                            }).catch(err => logger.warn('⚠️ Error recargando subtítulos:', err));
                          }
                        }
                        setShowAudioMenu(false);
                      }}
                      className={`w-full px-6 py-3 text-left text-sm font-semibold transition-all duration-200 flex items-center gap-3 border-t border-gray-800 ${
                        selectedAudio === 'latino' 
                          ? 'bg-blue-600 text-white shadow-lg' 
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <img 
                        src="https://flagcdn.com/w40/mx.png"
                        alt="Mexico Flag"
                        className="w-8 h-6 object-cover rounded shadow-md"
                      />
                      <span className="text-base">LATINO</span>
                    </button>
                  )}
                </div>
              </div>,
              document.querySelector('.video-js') || document.body
            )}

            {/* Next Up Overlay - créditos o últimos 10 segundos */}
            {hasNextEpisode && onEpisodeSelect && (
              <NextUpOverlay
                currentTime={currentTime}
                duration={playerState.duration || 0}
                creditsStart={creditsTiming?.start}
                creditsEnd={creditsTiming?.end}
                nextEpisode={nextEpisodeData || {
                  season: nextEpisodeInfo?.season || movieMetadata?.season || tvMetadata?.season || 1,
                  episode: nextEpisodeInfo?.episode || (movieMetadata?.episode || tvMetadata?.episode || 1) + 1,
                  title: nextEpisodeInfo?.title || `Episodio ${(movieMetadata?.episode || tvMetadata?.episode || 1) + 1}`,
                  stillPath: undefined,
                }}
                onPlayNext={() => {
                  if (nextEpisodeInfo) {
                    logger.log(`⏭️ [NEXT-UP] Cambiando a S${nextEpisodeInfo.season}E${nextEpisodeInfo.episode}`);
                    onEpisodeSelect(nextEpisodeInfo.season, nextEpisodeInfo.episode, {});
                  } else {
                    const currentSeason = movieMetadata?.season || tvMetadata?.season || 1;
                    const currentEpisode = movieMetadata?.episode || tvMetadata?.episode || 1;
                    logger.log(`⏭️ [NEXT-UP] Fallback: Cambiando a S${currentSeason}E${currentEpisode + 1}`);
                    onEpisodeSelect(currentSeason, currentEpisode + 1, {});
                  }
                }}
                isFullscreen={isFullscreen}
              />
            )}
            
            {/* Título del contenido movido al reproductor (control bar) */}

            {/* Modal de selector de episodios - RENDERIZADO VÍA PORTAL EN VIDEO.JS */}
            {showEpisodeSelector && tvMetadata?.tmdbId && overlayContainer && createPortal(
              <EpisodeSelector
                isOpen={showEpisodeSelector}
                tmdbId={typeof tvMetadata.tmdbId === 'number' ? tvMetadata.tmdbId : parseInt(tvMetadata.tmdbId.toString())}
                currentSeason={tvMetadata.season || 1}
                currentEpisode={tvMetadata.episode || 1}
                onEpisodeSelect={(season: number, episode: number, episodeData: any) => {
                  setShowEpisodeSelector(false);
                  if (onEpisodeSelect) {
                    onEpisodeSelect(season, episode, episodeData);
                  }
                }}
                onSeasonChange={(newSeason: number) => {
                  // Solo actualizar la temporada actual sin reproducir automáticamente
                  // El usuario debe seleccionar manualmente el episodio que quiere ver
                }}
                onClose={() => setShowEpisodeSelector(false)}
              />,
              overlayContainer
            )}
            
            {/* Backdrop overlay con fade durante carga */}
            {movieMetadata?.backdropPath && posterOpacity > 0 && (
              <div 
                className="absolute inset-0 bg-black flex items-center justify-center transition-opacity duration-700 pointer-events-none z-10"
                style={{ opacity: posterOpacity }}
              >
                <div className="relative w-full h-full">
                  <img
                    src={movieMetadata.backdropPath}
                    alt="Loading..."
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Gradient overlay para texto */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/90" />
                  
                  {/* Loading indicator sobre el backdrop */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {movieMetadata?.logoPath ? (
                      <div className="max-w-lg w-full px-8">
                        <img
                          src={movieMetadata.logoPath}
                          alt={movieMetadata.title || 'Loading'}
                          className="w-full h-auto logo-reveal"
                        />
                      </div>
                    ) : (
                      <div className="text-white text-3xl font-bold logo-reveal px-8">
                        {movieMetadata?.title || 'Cargando...'}
                      </div>
                    )}
                    {/* Spinner de carga principal */}
                    <div className="mt-6 flex items-center gap-3 text-white/80">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
                    </div>
                    {playerState.progress > 0 && (
                      <p className="text-white/60 text-sm mt-8">{Math.round(playerState.progress)}%</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Loading del video (solo en modo standalone sin backdrop) */}
          {!isModalPlayer && playerState.isLoading && !movieMetadata?.backdropPath && (
            <div className="flex flex-col items-center justify-center py-8">
              {movieMetadata?.logoPath ? (
                <div className="max-w-xs w-full px-8">
                  <img
                    src={movieMetadata.logoPath}
                    alt={movieMetadata.title || 'Loading'}
                    className="w-full h-auto logo-reveal"
                  />
                </div>
              ) : (
                <div className="text-white text-lg font-bold logo-reveal px-8">
                  {movieMetadata?.title || 'Cargando...'}
                </div>
              )}
              <div className="mt-4 flex items-center gap-3 text-white/80">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
              </div>
              {playerState.progress > 0 && (
                <p className="text-white/60 text-sm mt-4">{Math.round(playerState.progress)}%</p>
              )}
            </div>
          )}

          {/* Información del torrent (solo en modo standalone) */}
          {!isModalPlayer && torrentInfo && (
            <div className="bg-gray-900 p-4 rounded-lg">
              <h3 className="text-white font-medium mb-2">{torrentInfo.name}</h3>
              <div className="flex items-center gap-4 text-sm text-gray-400 mb-2">
                <span>{torrentInfo.videoFiles.length} archivo(s) de video</span>
                {torrentInfo.subtitleFiles.length > 0 && (
                  <span>{torrentInfo.subtitleFiles.length} subtítulo(s) externo(s)</span>
                )}
              </div>
            </div>
          )}

          {/* Controles de subtítulos (solo en modo standalone) */}
          {!isModalPlayer && (
            <div className="bg-gray-900 p-4 rounded-lg">
              <h3 className="text-white font-medium mb-3">Subtítulos</h3>
              <SubtitleControls
                isSearching={subtitlesSearching}
                downloadedSubtitles={downloadedSubtitles}
                onFileUpload={handleSubtitleUpload}
              />
            </div>
          )}

          {/* Selector de archivos (solo en modo standalone cuando hay múltiples) */}
          {!isModalPlayer && torrentInfo && torrentInfo.videoFiles.length > 1 && (
            <div className="bg-gray-900 p-4 rounded-lg">
              <h3 className="text-white font-medium mb-3">Cambiar archivo</h3>
              <TorrentSelector
                files={torrentInfo.videoFiles}
                selectedIndex={selectedFileIndex}
                onSelectFile={selectFile}
              />
            </div>
          )}
        </div>
      )}

      {/* Modal de configuración de subtítulos - DESHABILITADO: Ahora se usa modal nativo en el player */}
      {/* <SubtitleSettingsModal
        isOpen={playerState.subtitleSettingsOpen}
        onClose={closeSubtitleSettings}
        onApply={applySubtitleSettings}
        currentSettings={playerState.subtitleSettings}
        movieTitle={movieMetadata?.title || tvMetadata?.title}
        imdbId={movieMetadata?.imdbId}
        tmdbId={typeof (movieMetadata?.tmdbId || tvMetadata?.tmdbId) === 'number' ? (movieMetadata?.tmdbId || tvMetadata?.tmdbId) : undefined}
        season={movieMetadata?.season || tvMetadata?.season}
        episode={movieMetadata?.episode || tvMetadata?.episode}
        isTV={!!tvMetadata}
        playerRef={playerRef}
        movieHash={movieHash || undefined}
        movieByteSize={movieByteSize || undefined}
        onConfirmSubtitles={async (subtitleData) => {
          try {
            logger.log('✅ [SUBTITLE-CONFIRM] Confirmando subtítulos desde StreamingPlayer:', subtitleData);
            
            // Enviar al endpoint de Next.js que redirige al streaming-server
            const response = await fetch('/api/subtitles/confirm', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(subtitleData),
            });

            if (response.ok) {
              const result = await response.json();
              logger.log('✅ [SUBTITLE-CONFIRM] Subtítulos guardados exitosamente:', result);
              
              // Opcional: Mostrar notificación de éxito
              // toast.success('Subtítulos confirmados y guardados');
            } else {
              logger.error('❌ [SUBTITLE-CONFIRM] Error guardando subtítulos:', response.statusText);
            }
          } catch (error) {
            logger.error('❌ [SUBTITLE-CONFIRM] Error en callback:', error);
          }
        }}
      /> */}
      
      {/* Watch Party Overlay - Transparente y compacto */}
      {isWatchPartyActive && showWatchPartyChat && (
        <div className="fixed top-4 right-4 w-80 bg-black/40 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl z-[9999] flex flex-col max-h-[80vh]">
          {/* Header compacto */}
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-gray-400 text-xs">Sala: {watchPartyRoomId}</span>
              <button
                onClick={() => {
                  // La URL ya tiene watchparty, solo eliminar username si existe
                  const url = new URL(window.location.href);
                  url.searchParams.delete('username');
                  navigator.clipboard.writeText(url.toString());
                  alert('¡Link copiado!');
                }}
                className="text-purple-400 hover:text-purple-300 text-xs font-medium"
              >
                Copiar
              </button>
            </div>
            <button
              onClick={() => setShowWatchPartyChat(false)}
              className="text-white/60 hover:text-white transition-colors text-lg leading-none"
            >
              ✕
            </button>
          </div>
          
          {/* Users compacto */}
          <div className="px-3 py-2 border-b border-white/10">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white/60 text-xs">{watchPartyUsers.length} {watchPartyUsers.length === 1 ? 'usuario' : 'usuarios'}</span>
              {watchPartyUsers.map((user, idx) => (
                <span
                  key={idx}
                  className="bg-white/10 px-2 py-0.5 rounded text-white text-xs"
                >
                  {user.isHost && '👑'} {user.username}
                </span>
              ))}
            </div>
          </div>
          
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px] max-h-[300px]">
            {watchPartyMessages.length === 0 && (
              <div className="text-white/40 text-xs text-center py-8">
                Chat vacío
              </div>
            )}
            {watchPartyMessages.map((msg, idx) => (
              <div key={idx} className="bg-white/5 backdrop-blur-sm p-2 rounded">
                <div className="text-purple-400 text-xs font-medium">{msg.user}</div>
                <div className="text-white text-sm">{msg.message}</div>
              </div>
            ))}
          </div>
          
          {/* Chat Input */}
          <div className="p-2 border-t border-white/10">
            <input
              type="text"
              placeholder="Mensaje..."
              className="w-full bg-white/10 text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder-white/40"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim() && socket) {
                  socket.emit('chat-message', {
                    roomId: watchPartyRoomId,
                    message: e.currentTarget.value.trim()
                  });
                  e.currentTarget.value = '';
                }
              }}
            />
          </div>
        </div>
      )}
      
      {/* Watch Party Toggle Button (cuando está minimizado) */}
      {isWatchPartyActive && !showWatchPartyChat && (
        <button
          onClick={() => setShowWatchPartyChat(true)}
          className="fixed bottom-20 right-4 bg-black/40 backdrop-blur-md hover:bg-black/50 text-white px-4 py-3 rounded-full shadow-2xl z-[9999] flex items-center gap-2 transition-all border border-white/10"
        >
          <span className="text-xl">💬</span>
          <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {watchPartyUsers.length || 0}
          </span>
        </button>
      )}
    </div>
  );
}

