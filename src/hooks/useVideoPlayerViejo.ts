import { useRef, useEffect, useCallback, useState } from 'react';
import videojs from 'video.js';
import '../components/VideoJSSubtitleUploadPlugin.js';
import '../components/VideoJSSubtitleSyncPlugin.js';
import '../components/VideoJSSkipBackwardPlugin.js';
import '../components/VideoJSSkipForwardPlugin.js';
import { playerLogger, logger } from '@/lib/logger';

// Tipo local para configuración de subtítulos
export interface SubtitleSettings {
  offset: number;
  fontPercent?: number;
  textColor?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  fontFamily?: string;
  position?: 'top' | 'bottom';
}

// Extender el tipo Player de VideoJS para incluir chromecast y controlBar
declare module 'video.js' {
  interface Player {
    chromecast?: {
      isConnected(): boolean;
      [key: string]: any;
    };
    controlBar?: {
      el(): HTMLElement | null;
      [key: string]: any;
    };
  }
}

interface UseVideoPlayerOptions {
  streamUrl: string | null;
  videoDuration?: number; // Duración real del video desde el servidor
  movieTitle?: string; // Título de la película para Chromecast
  moviePoster?: string; // Poster de la película para Chromecast
  onError?: (error: string) => void;
  onReady?: () => void;
  onClose?: () => void; // Callback para cerrar el reproductor
  onEpisodeButtonClick?: () => void; // Callback para el botón de episodios
  showEpisodeButton?: boolean; // Si mostrar el botón de episodios
  onNextEpisodeClick?: () => void; // Callback para ir al siguiente episodio
  showNextEpisodeButton?: boolean; // Si mostrar el botón de próximo episodio
  onTimeUpdate?: (currentTime: number) => void; // Callback para actualizaciones de tiempo
  // Propiedades para identificación de contenido y subtítulos
  imdbId?: string; // ID de IMDb para identificación de contenido
  tmdbId?: string | number; // ID de TMDB para identificación de contenido (puede ser string o number)
  season?: number; // Temporada (para series de TV)
  episode?: number; // Episodio (para series de TV)
  episodeTitle?: string; // Título del episodio (para series de TV)
  isTV?: boolean; // Indica si es contenido de TV
  movieHash?: string; // Hash del torrent para identificación única
  // Subtítulos precargados de la búsqueda automática
  availableSubtitles?: any[]; // Resultados de la búsqueda automática
  getAvailableSubtitles?: () => any[]; // Función para obtener subtítulos dinámicamente
  // Resultados de Subdivx persistentes
  subdivxResults?: any[]; // Resultados de búsqueda de Subdivx
  onSubdivxResultsChange?: (results: any[]) => void; // Callback para actualizar resultados
  // Metadata adicional para overlay de pausa
  logoPath?: string; // Logo de la serie/película
  year?: number | string; // Año de lanzamiento
  rating?: number; // Puntaje (0-10)
  overview?: string; // Sinopsis
  // Audio personalizado (español latino)
  customStreamUrl?: string | null; // URL del stream personalizado
  onToggleAudioMenu?: () => void; // Callback para toggle del menú de audio
}

interface VideoPlayerState {
  isLoading: boolean;
  progress: number;
  duration: number | null;
  subtitleSettingsOpen: boolean;
  subtitleSettings: SubtitleSettings;
}

export function useVideoPlayer({ streamUrl, videoDuration, movieTitle, moviePoster, onError, onReady, onClose, onEpisodeButtonClick, showEpisodeButton, onNextEpisodeClick, showNextEpisodeButton, onTimeUpdate, imdbId, tmdbId, season, episode, episodeTitle, isTV, movieHash, availableSubtitles = [], getAvailableSubtitles, subdivxResults = [], onSubdivxResultsChange, logoPath, year, rating, overview, customStreamUrl, onToggleAudioMenu }: UseVideoPlayerOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<ReturnType<typeof videojs> | null>(null);
  
  // Refs para variables que cambian frecuentemente (evitar recrear callbacks)
  const movieTitleRef = useRef(movieTitle);
  const imdbIdRef = useRef(imdbId);
  const tmdbIdRef = useRef(tmdbId);
  const seasonRef = useRef(season);
  const episodeRef = useRef(episode);
  const isTVRef = useRef(isTV);
  const availableSubtitlesRef = useRef(availableSubtitles);
  const getAvailableSubtitlesRef = useRef(getAvailableSubtitles);
  const subdivxResultsRef = useRef(subdivxResults);
  const onSubdivxResultsChangeRef = useRef(onSubdivxResultsChange);
  
  // Actualizar refs cuando cambien los valores
  useEffect(() => {
    movieTitleRef.current = movieTitle;
    imdbIdRef.current = imdbId;
    tmdbIdRef.current = tmdbId;
    seasonRef.current = season;
    episodeRef.current = episode;
    isTVRef.current = isTV;
    availableSubtitlesRef.current = availableSubtitles;
    getAvailableSubtitlesRef.current = getAvailableSubtitles;
    subdivxResultsRef.current = subdivxResults;
    onSubdivxResultsChangeRef.current = onSubdivxResultsChange;
  }, [movieTitle, imdbId, tmdbId, season, episode, isTV, availableSubtitles, getAvailableSubtitles, subdivxResults, onSubdivxResultsChange]);
  
  const [playerState, setPlayerState] = useState<VideoPlayerState>({
    isLoading: false,
    progress: 0,
    duration: null,
    subtitleSettingsOpen: false,
    subtitleSettings: {
      offset: 0,
      fontPercent: 1.0,
      textColor: '#FFFFFF',
      backgroundColor: '#000000',
      backgroundOpacity: 0, // Sin fondo, solo sombra
      fontFamily: 'Arial, sans-serif',
      position: 'bottom',
    },
  });

  // Helper para manejar errores
  const handleError = useCallback((message: string) => {
    logger.error('❌ [PLAYER]', message);
    if (onError) onError(message);
  }, [onError]);

  // Actualizar duración cuando llegue del servidor (después de que el player ya está listo)
  useEffect(() => {
    if (videoDuration && videoDuration > 0 && playerRef.current) {
      playerLogger.log(`🔄 [PLAYER] Actualizando duración a ${videoDuration}s desde prop`);
      
      const player = playerRef.current;
      const currentDuration = player.duration();
      
      // Si la duración actual es diferente, forzar actualización
      if (!currentDuration || Math.abs(currentDuration - videoDuration) > 10) {
        playerLogger.log(`⚠️ [PLAYER] Forzando actualización: ${currentDuration}s → ${videoDuration}s`);
        
        const tech = player.tech();
        if (tech && tech.el_) {
          Object.defineProperty(tech.el_, 'duration', {
            get: () => videoDuration,
            configurable: true
          });
          
          player.trigger('durationchange');
          playerLogger.log('✅ [PLAYER] Duración actualizada dinámicamente');
        }
        
        setPlayerState(prev => ({ ...prev, duration: videoDuration }));
      }
    }
  }, [videoDuration]);


  // Agregar subtítulo externo
  const addSubtitle = useCallback((file: File, language: string = 'es') => {
    if (!playerRef.current) return;

    try {
      const url = URL.createObjectURL(file);
      
      playerRef.current.addRemoteTextTrack({
        kind: 'subtitles',
        src: url,
        srclang: language,
        label: file.name,
        default: true,
      }, false);

      playerLogger.log('✅ [SUBTITLES] Subtítulo agregado:', file.name);
    } catch (error) {
      logger.error('❌ [SUBTITLES] Error agregando subtítulo:', error);
    }
  }, []);

  // Agregar subtítulo desde URL
  const addSubtitleFromUrl = useCallback((url: string, language: string, label: string) => {
    if (!playerRef.current) return;

    try {
      // Detectar si ya hay un track de subtítulos activo
      let hasActiveSubtitle = false;
      try {
        const tracks: any = playerRef.current.textTracks();
        const trackCount: number = tracks?.length || 0;
        for (let i = 0; i < trackCount; i++) {
          const t = tracks[i];
          if ((t?.kind === 'subtitles' || t?.kind === 'captions') && t?.mode === 'showing') {
            hasActiveSubtitle = true;
            break;
          }
        }
      } catch {}

      const remote = playerRef.current.addRemoteTextTrack({
        kind: 'subtitles',
        src: url,
        srclang: language,
        label: label,
        // Si no hay ninguno activo, marcar este como default y mostrarlo
        default: !hasActiveSubtitle,
      }, false);

      if (!hasActiveSubtitle) {
        // Asegurar que el último track agregado se muestre
        try {
          const tracks: any = playerRef.current.textTracks();
          const idx = (tracks?.length || 0) - 1;
          const t = idx >= 0 ? tracks[idx] : null;
          if (t) t.mode = 'showing';
        } catch {}
      }

      // Debug: verificar cues cargados del último track
      setTimeout(() => {
        try {
          const tracks: any = playerRef.current?.textTracks();
          const idx = (tracks?.length || 0) - 1;
          const t = idx >= 0 ? tracks[idx] : null;
          const cuesCount = t?.cues ? t.cues.length : 0;
          playerLogger.log(`📊 [SUBTITLES] Track '${label}' cues: ${cuesCount}`);
          if (t?.cues && cuesCount > 0) {
            const firstCue: any = t.cues[0];
            const lastCue: any = t.cues[cuesCount - 1];
            playerLogger.log(`⏱️ [SUBTITLES] Primer cue: ${firstCue.startTime?.toFixed(2)}s, Último: ${lastCue.endTime?.toFixed(2)}s`);
          }
        } catch (e) {
          playerLogger.warn('⚠️ [SUBTITLES] No se pudo inspeccionar cues:', e);
        }
      }, 800);

      playerLogger.log('✅ [SUBTITLES] Subtítulo agregado:', label);
    } catch (error) {
      logger.error('❌ [SUBTITLES] Error agregando subtítulo:', error);
    }
  }, []);

  // Play/Pause toggle
  const togglePlayPause = useCallback(() => {
    if (!playerRef.current) return;
    
    if (playerRef.current.paused()) {
      playerRef.current.play();
    } else {
      playerRef.current.pause();
    }
  }, []);

  // Seek to position
  const seek = useCallback((seconds: number) => {
    if (!playerRef.current) return;
    playerRef.current.currentTime(seconds);
  }, []);

  // Set volume
  const setVolume = useCallback((volume: number) => {
    if (!playerRef.current) return;
    playerRef.current.volume(volume);
  }, []);

  // Aplicar configuración de subtítulos
  const applySubtitleSettings = useCallback((settings: SubtitleSettings) => {
    playerLogger.log('🎯 [APPLY-SETTINGS] Aplicando configuración:', settings);
    
    setPlayerState(prev => {
      playerLogger.log('📊 [APPLY-SETTINGS] Estado anterior:', prev.subtitleSettings);
      playerLogger.log('📊 [APPLY-SETTINGS] Estado nuevo:', settings);
      return { ...prev, subtitleSettings: settings };
    });
    
    if (playerRef.current) {
      const player = playerRef.current as any;
      
      // Aplicar offset directamente a los subtítulos activos
      const tracks = player.textTracks();
      const tracksArray = Array.from(tracks);
      
      tracksArray.forEach((track: any) => {
        // Solo procesar tracks de subtítulos/captions que tengan cues
        if ((track.kind === 'subtitles' || track.kind === 'captions') && track.cues && track.cues.length > 0) {
          const cuesArray = Array.from(track.cues);
          
          cuesArray.forEach((cue: any) => {
            // Guardar tiempos originales SOLO la primera vez (cuando no existen)
            if (cue.__originalStartTime === undefined) {
              cue.__originalStartTime = cue.startTime;
              cue.__originalEndTime = cue.endTime;
              playerLogger.log(`💾 [SUBTITLE-SETTINGS] Guardando tiempos originales: ${cue.startTime.toFixed(2)}s - ${cue.endTime.toFixed(2)}s`);
            }
            
            // SIEMPRE aplicar el offset desde los tiempos originales guardados
            cue.startTime = cue.__originalStartTime + (settings.offset || 0);
            cue.endTime = cue.__originalEndTime + (settings.offset || 0);
          });
          
          playerLogger.log(`✅ [SUBTITLE-SETTINGS] Offset de ${settings.offset || 0}s aplicado a ${cuesArray.length} cues del track ${track.language || 'unknown'}`);
        }
      });

      playerLogger.log('✅ [SUBTITLE-SETTINGS] Offset aplicado correctamente');
      
      // Aplicar estilos de subtítulos con CSS directo (más confiable que textTrackSettings)
      try {
        playerLogger.log('🎨 [SUBTITLE-STYLES] Aplicando estilos personalizados');
        
        // Crear o actualizar el style element
        let styleElement = document.getElementById('vjs-subtitle-custom-styles');
        if (!styleElement) {
          styleElement = document.createElement('style');
          styleElement.id = 'vjs-subtitle-custom-styles';
          document.head.appendChild(styleElement);
          playerLogger.log('📝 [SUBTITLE-STYLES] Style element creado');
        }
        
        // Calcular valores
        const fontSizeEm = 2.1 * (settings.fontPercent || 1.0);
        const textColor = settings.textColor || '#FFFFFF';
        const bgColor = settings.backgroundColor || '#000000';
        const bgOpacity = settings.backgroundOpacity ?? 0; // Sin fondo por defecto
        const fontFamily = settings.fontFamily || 'Arial, sans-serif';
        const position = settings.position || 'bottom';
        
        // Convertir hex a rgba para el fondo
        const r = parseInt(bgColor.slice(1, 3), 16);
        const g = parseInt(bgColor.slice(3, 5), 16);
        const b = parseInt(bgColor.slice(5, 7), 16);
        const bgColorRGBA = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;
        
        // Aplicar todos los estilos en un solo CSS
        styleElement.textContent = `
          /* Posición de los subtítulos */
          .video-js .vjs-text-track-display {
            ${position === 'top' ? 'top: 10% !important; bottom: auto !important;' : 'bottom: 15% !important; top: auto !important;'}
          }
          
          /* Estilos de los subtítulos */
          .video-js .vjs-text-track-cue,
          .video-js .vjs-text-track-cue > div {
            font-size: ${fontSizeEm}em !important;
            color: ${textColor} !important;
            background-color: ${bgColorRGBA} !important;
            font-family: ${fontFamily} !important;
            text-shadow: 
              -2px -2px 4px rgba(0, 0, 0, 0.9),
              2px -2px 4px rgba(0, 0, 0, 0.9),
              -2px 2px 4px rgba(0, 0, 0, 0.9),
              2px 2px 4px rgba(0, 0, 0, 0.9),
              0 0 8px rgba(0, 0, 0, 0.9) !important;
          }
        `;
        
        playerLogger.log('✅ [SUBTITLE-STYLES] Estilos aplicados:', {
          fontSize: `${fontSizeEm}em (${Math.round((settings.fontPercent || 1.0) * 100)}%)`,
          textColor,
          backgroundColor: bgColorRGBA,
          fontFamily,
          position,
        });
      } catch (error) {
        logger.error('❌ [SUBTITLE-STYLES] Error al aplicar estilos:', error);
      }
    }
  }, []);

  // Abrir modal de configuración de subtítulos (modal nativo en el player)
  const openSubtitleSettings = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    const playerEl = player.el();
    if (!playerEl) return;

    // Remover modal existente si hay uno
    const existingModal = playerEl.querySelector('.vjs-subtitle-settings-modal');
    if (existingModal) {
      existingModal.remove();
    }

    // Obtener valores actuales desde refs
    const movieTitle = movieTitleRef.current;
    const imdbId = imdbIdRef.current;
    const tmdbId = tmdbIdRef.current;
    const season = seasonRef.current;
    const episode = episodeRef.current;
    const isTV = isTVRef.current;
    
    playerLogger.log('🔍 [MODAL] Parámetros disponibles:', { movieTitle, imdbId, season, episode, isTV });

    // Estado del modal
    let activeTab: 'subtitles' | 'opensubtitles' | 'subdivx' | 'settings' = 'subtitles';
    // Usar una función para obtener subtítulos dinámicamente desde refs
    const getCurrentAvailableSubtitles = () => {
      if (getAvailableSubtitlesRef.current) {
        return getAvailableSubtitlesRef.current();
      }
      return availableSubtitlesRef.current || [];
    };
    let openSubtitlesResults: any[] = [];
    let isSearchingOpenSubtitles = false;
    let isDownloadingOpenSubtitles = false;
    let downloadingOpenSubtitlesId: string | null = null;
    let hasSearchedOpenSubtitles = false;
    // Usar resultados de Subdivx desde ref
    let subdivxResults: any[] = subdivxResultsRef.current || [];
    let isSearchingSubdivx = false;
    let isDownloadingSubdivx = false;
    let downloadingSubdivxId: string | null = null;
    let hasSearchedSubdivx = subdivxResults.length > 0; // Ya se buscó si hay resultados guardados

    // Función para convertir SRT a VTT
    const convertSRTtoVTT = (srt: string): string => {
      let vtt = 'WEBVTT\n\n';
      const lines = srt.split(/\r?\n/);
      const timestampRegex = /^\d{2}:\d{2}:\d{2}[,.:]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.:]\d{3}$/;

      const result: string[] = [];
      let currentSubtitle: string[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine === '') {
          if (currentSubtitle.length > 0) {
            const hasValidTimestamp = currentSubtitle.some(l => timestampRegex.test(l));
            const hasText = currentSubtitle.some(l => 
              !timestampRegex.test(l) && !/^\d+$/.test(l) && l.trim() !== ''
            );

            if (hasValidTimestamp && hasText) {
              const processedLines = currentSubtitle
                .filter(l => !/^\d+$/.test(l))
                .map(l => l.replace(/,(\d{3})/g, '.$1'));
              
              result.push(processedLines.join('\n'));
            }
            currentSubtitle = [];
          }
        } else {
          currentSubtitle.push(trimmedLine);
        }
      }

      if (currentSubtitle.length > 0) {
        const hasValidTimestamp = currentSubtitle.some(l => timestampRegex.test(l));
        const hasText = currentSubtitle.some(l => 
          !timestampRegex.test(l) && !/^\d+$/.test(l) && l.trim() !== ''
        );

        if (hasValidTimestamp && hasText) {
          const processedLines = currentSubtitle
            .filter(l => !/^\d+$/.test(l))
            .map(l => l.replace(/,(\d{3})/g, '.$1'));
          
          result.push(processedLines.join('\n'));
        }
      }

      vtt += result.join('\n');
      return vtt;
    };

    // Función para buscar en OpenSubtitles
    const searchOpenSubtitles = async () => {
      if (!movieTitle && !imdbId && !tmdbId) {
        playerLogger.log('❌ [OPENSUBTITLES] No hay parámetros de búsqueda');
        return;
      }

      if (isSearchingOpenSubtitles || hasSearchedOpenSubtitles) {
        return; // Ya está buscando o ya buscó
      }

      isSearchingOpenSubtitles = true;
      hasSearchedOpenSubtitles = true;
      renderContent();

      try {
        playerLogger.log('🔍 [OPENSUBTITLES] Buscando subtítulos vía Wyzie...');
        
        // Buscar con Wyzie filtrando por source=opensubtitles
        // Una sola búsqueda sin especificar idioma (Wyzie retorna todos)
        const params = new URLSearchParams();
        if (imdbId) params.append('imdbId', imdbId);
        else if (tmdbId) params.append('tmdbId', tmdbId.toString());
        else throw new Error('No hay imdbId ni tmdbId');
        
        params.append('source', 'opensubtitles');
        
        if (season) params.append('season', season.toString());
        if (episode) params.append('episode', episode.toString());
        
        playerLogger.log('🌐 [OPENSUBTITLES] URL:', `/api/wyzie-subtitles?${params.toString()}`);
        
        const response = await fetch(`/api/wyzie-subtitles?${params.toString()}`, {
          method: 'GET',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Error en búsqueda');
        }

        const contentType = response.headers.get('content-type');
        
        if (contentType?.includes('application/json')) {
          const data = await response.json();
          if (data.success && data.subtitles) {
            // Filtrar solo español e inglés y ordenar (español primero, inglés después)
            // Asignar ID único usando el índice para evitar duplicados
            const allSubs = data.subtitles.map((sub: any, idx: number) => ({
              id: `${sub.id}-${idx}`, // ID único combinando original + índice
              originalId: sub.id, // Guardar el ID original de Wyzie
              url: sub.url,
              language: sub.language,
              languageName: sub.display,
              filename: sub.media,
              format: sub.format,
              encoding: sub.encoding,
              isHearingImpaired: sub.isHearingImpaired,
            }));
            
            // Filtrar y ordenar
            const spanishSubs = allSubs.filter((sub: any) => sub.language === 'es' || sub.language === 'spa' || sub.languageName.toLowerCase().includes('spanish'));
            const englishSubs = allSubs.filter((sub: any) => sub.language === 'en' || sub.language === 'eng' || sub.languageName.toLowerCase().includes('english'));
            
            // Primero español, luego inglés
            openSubtitlesResults = [...spanishSubs, ...englishSubs];
            
            playerLogger.log(`✅ [OPENSUBTITLES] Encontrados ${openSubtitlesResults.length} subtítulos vía Wyzie (${spanishSubs.length} español, ${englishSubs.length} inglés)`);
          } else {
            openSubtitlesResults = [];
            playerLogger.log('⚠️ [OPENSUBTITLES] No se encontraron subtítulos');
          }
        } else {
          openSubtitlesResults = [];
          playerLogger.log('⚠️ [OPENSUBTITLES] Respuesta no es JSON');
        }
      } catch (error) {
        playerLogger.log('❌ [OPENSUBTITLES] Error:', error);
        openSubtitlesResults = [];
      } finally {
        isSearchingOpenSubtitles = false;
        renderContent();
      }
    };

    // Función para descargar y cargar un subtítulo de OpenSubtitles
    const downloadAndLoadOpenSubtitle = async (subtitle: any) => {
      isDownloadingOpenSubtitles = true;
      downloadingOpenSubtitlesId = subtitle.id;
      renderContent();

      try {
        playerLogger.log('⬇️ [OPENSUBTITLES] Descargando subtítulo:', subtitle);

        // Verificar si ya tiene VTT (viene de Wyzie pre-descargado)
        if (subtitle.vtt) {
          playerLogger.log('✅ [WYZIE] Subtítulo ya tiene VTT, usando directamente');
          const vttContent = subtitle.vtt;
          
          // Crear blob URL
          const blob = new Blob([vttContent], { type: 'text/vtt' });
          const url = URL.createObjectURL(blob);
          
          // Agregar track con label único incluyendo el ID
          const label = `${subtitle.languageName || subtitle.language} - ${subtitle.filename || 'Wyzie'} [${subtitle.id}]`;
          
          playerLogger.log('🔨 [WYZIE] Agregando track con label:', label);
          
          player.addRemoteTextTrack({
            kind: 'subtitles',
            label,
            srclang: subtitle.language,
            src: url
          }, false);

          playerLogger.log('✅ [WYZIE] Track agregado correctamente');
          
          isDownloadingOpenSubtitles = false;
          downloadingOpenSubtitlesId = null;
          renderContent();
          return;
        }

        // Si tiene URL de Wyzie, descargar y convertir
        if (subtitle.url && subtitle.url.includes('wyzie.ru')) {
          playerLogger.log('⬇️ [WYZIE] Descargando desde:', subtitle.url);
          
          const response = await fetch(subtitle.url);
          if (!response.ok) throw new Error('Error descargando desde Wyzie');
          
          const srtContent = await response.text();
          playerLogger.log('✅ [WYZIE] Descargado, tamaño:', srtContent.length);
          
          // Convertir SRT a VTT
          let vttContent = srtContent;
          if (!srtContent.trim().startsWith('WEBVTT')) {
            playerLogger.log('🔄 [WYZIE] Convirtiendo SRT a VTT...');
            vttContent = convertSRTtoVTT(srtContent);
            playerLogger.log('✅ [WYZIE] Convertido a VTT');
          }
          
          // Crear blob URL
          const blob = new Blob([vttContent], { type: 'text/vtt' });
          const url = URL.createObjectURL(blob);
          
          // Agregar track con label único incluyendo el ID
          const label = `${subtitle.languageName || subtitle.language} - ${subtitle.filename || 'Wyzie'} [${subtitle.id}]`;
          
          player.addRemoteTextTrack({
            kind: 'subtitles',
            label,
            srclang: subtitle.language,
            src: url
          }, false);

          playerLogger.log('✅ [WYZIE] Track agregado correctamente con label:', label);
          
          isDownloadingOpenSubtitles = false;
          downloadingOpenSubtitlesId = null;
          renderContent();
          return;
        }

        // Verificar si es del formato SubtitleFile (búsqueda automática) o OpenSubtitlesResult (búsqueda manual)
        const isSubtitleFile = subtitle.url && subtitle.filename && subtitle.languageName;
        
        let vttContent = '';

        if (isSubtitleFile) {
          // Formato SubtitleFile de la búsqueda automática - usar file_id numérico
          playerLogger.log('📡 [OPENSUBTITLES] Haciendo fetch con file_id:', parseInt(subtitle.id));
          
          const response = await fetch('/api/subtitles/opensubtitles-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: parseInt(subtitle.id) })
          });

          playerLogger.log('📡 [OPENSUBTITLES] Respuesta recibida, status:', response.status);

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error descargando subtítulo');
          }
          
          playerLogger.log('📡 [OPENSUBTITLES] Parseando JSON...');
          const data = await response.json();
          playerLogger.log('📡 [OPENSUBTITLES] JSON parseado, content length:', data.content?.length || 0);
          vttContent = data.content;
        } else {
          // Formato OpenSubtitlesResult de búsqueda manual
          const files = subtitle.attributes?.files;
          if (!files || files.length === 0) {
            throw new Error('No hay archivos disponibles');
          }

          const fileId = files[0]?.file_id;
          const downloadId = fileId && fileId !== 0 ? fileId : subtitle.attributes.subtitle_id;

          playerLogger.log('📡 [OPENSUBTITLES] Haciendo fetch con file_id:', downloadId);
          
          const response = await fetch('/api/subtitles/opensubtitles-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: downloadId })
          });

          playerLogger.log('📡 [OPENSUBTITLES] Respuesta recibida, status:', response.status);

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error descargando subtítulo');
          }
          
          playerLogger.log('📡 [OPENSUBTITLES] Parseando JSON...');
          const data = await response.json();
          playerLogger.log('📡 [OPENSUBTITLES] JSON parseado, content length:', data.content?.length || 0);
          vttContent = data.content;
        }

        playerLogger.log('✅ [OPENSUBTITLES] VTT content obtenido, length:', vttContent?.length || 0);

        if (vttContent) {
          // Crear blob URL
          playerLogger.log('🔨 [OPENSUBTITLES] Creando blob...');
          const blob = new Blob([vttContent], { type: 'text/vtt' });
          const url = URL.createObjectURL(blob);
          playerLogger.log('🔨 [OPENSUBTITLES] Blob URL creada:', url);

          // Agregar track con label único que incluya el filename
          const language = isSubtitleFile ? subtitle.language : subtitle.attributes.language;
          const label = isSubtitleFile 
            ? `${subtitle.languageName} - ${subtitle.filename}`
            : `${subtitle.attributes.language.toUpperCase()} - ${subtitle.attributes.release}`;

          playerLogger.log('🔨 [OPENSUBTITLES] Agregando track con label:', label);

          const trackElement = player.addRemoteTextTrack({
            kind: 'subtitles',
            src: url,
            srclang: language,
            label: label,
            default: true
          }, false);

          playerLogger.log('✅ [OPENSUBTITLES] addRemoteTextTrack llamado');
          playerLogger.log('✅ [OPENSUBTITLES] Track element:', trackElement);
          
          // Esperar a que el track se registre antes de activar y cerrar
          setTimeout(() => {
            const textTracks = player.textTracks() as any;
            playerLogger.log('🔍 [OPENSUBTITLES] Total tracks después de agregar:', textTracks.length);
            
            // Desactivar todos los tracks
            for (let i = 0; i < textTracks.length; i++) {
              textTracks[i].mode = 'disabled';
            }
            // Activar el último (recién agregado)
            if (textTracks.length > 0) {
              textTracks[textTracks.length - 1].mode = 'showing';
              playerLogger.log('✅ [OPENSUBTITLES] Subtítulo activado:', textTracks[textTracks.length - 1].label);
            }
            
            // Cerrar el modal
            modal.remove();
            playerLogger.log('✅ [OPENSUBTITLES] Modal cerrado');
          }, 300);
        }
      } catch (error) {
        playerLogger.log('❌ [OPENSUBTITLES] Error:', error);
      } finally {
        isDownloadingOpenSubtitles = false;
        downloadingOpenSubtitlesId = null;
        renderContent();
      }
    };

    // Función para buscar en Subdivx
    const searchSubdivx = async () => {
      if (!movieTitle) {
        playerLogger.log('❌ [SUBDIVX] No hay título para búsqueda');
        return;
      }

      if (isSearchingSubdivx) {
        return; // Ya está buscando
      }

      isSearchingSubdivx = true;
      renderContent();

      try {
        let searchQuery = movieTitle;
        
        if ((isTV || (season !== undefined && episode !== undefined)) && season && episode) {
          const seriesName = movieTitle.replace(/\s+S\d+E\d+.*$/i, '').trim();
          searchQuery = `${seriesName} S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`;
        }

        playerLogger.log('🔍 [SUBDIVX] Buscando:', searchQuery);

        const response = await fetch(`/api/subtitles/subdivx?query=${encodeURIComponent(searchQuery)}&autoDownload=false`);

        if (!response.ok) throw new Error('Error en búsqueda');

        const data = await response.json();
        subdivxResults = data.results || [];
        hasSearchedSubdivx = true; // Marcar como buscado solo después de éxito
        
        // Guardar resultados en el estado del padre
        if (onSubdivxResultsChangeRef.current) {
          onSubdivxResultsChangeRef.current(subdivxResults);
        }
        
        playerLogger.log(`✅ [SUBDIVX] Encontrados ${subdivxResults.length} subtítulos`);
      } catch (error) {
        playerLogger.log('❌ [SUBDIVX] Error:', error);
        subdivxResults = [];
      } finally {
        isSearchingSubdivx = false;
        renderContent();
      }
    };

    // Función para descargar y cargar un subtítulo de Subdivx
    const downloadAndLoadSubdivx = async (result: any) => {
      isDownloadingSubdivx = true;
      downloadingSubdivxId = result.downloadUrl;
      renderContent();

      try {
        let searchQuery = movieTitle || '';
        
        if ((isTV || (season !== undefined && episode !== undefined)) && season && episode) {
          const seriesName = (movieTitle || '').replace(/\s+S\d+E\d+.*$/i, '').trim();
          searchQuery = `${seriesName} S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`;
        }

        playerLogger.log('⬇️ [SUBDIVX] Descargando:', result.title);
        playerLogger.log('📡 [SUBDIVX] URL:', result.downloadUrl);

        const response = await fetch(`/api/subtitles/subdivx?query=${encodeURIComponent(searchQuery)}&autoDownload=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ downloadUrl: result.downloadUrl })
        });

        playerLogger.log('📡 [SUBDIVX] Respuesta recibida, status:', response.status);

        if (!response.ok) throw new Error('Error descargando');

        const data = await response.json();
        playerLogger.log('📡 [SUBDIVX] Data recibida:', data);

        if (data.subtitleFiles && data.subtitleFiles.length > 0) {
          const subtitleFile = data.subtitleFiles[0];
          playerLogger.log('📡 [SUBDIVX] Subtitle file:', subtitleFile);
          
          // Crear blob URL
          const blob = new Blob([subtitleFile.content], { type: 'text/vtt' });
          const url = URL.createObjectURL(blob);
          playerLogger.log('🔨 [SUBDIVX] Blob URL creada:', url);

          // Agregar track
          const label = `${subtitleFile.language.toUpperCase()} - ${subtitleFile.name}`;
          playerLogger.log('🔨 [SUBDIVX] Agregando track con label:', label);

          player.addRemoteTextTrack({
            kind: 'subtitles',
            src: url,
            srclang: subtitleFile.language,
            label: label,
            default: true
          }, false);

          playerLogger.log('✅ [SUBDIVX] addRemoteTextTrack llamado');
          
          // Esperar a que el track se registre antes de activar y cerrar
          setTimeout(() => {
            const textTracks = player.textTracks() as any;
            playerLogger.log('🔍 [SUBDIVX] Total tracks después de agregar:', textTracks.length);
            
            // Desactivar todos los tracks
            for (let i = 0; i < textTracks.length; i++) {
              textTracks[i].mode = 'disabled';
            }
            // Activar el último (recién agregado)
            if (textTracks.length > 0) {
              textTracks[textTracks.length - 1].mode = 'showing';
              playerLogger.log('✅ [SUBDIVX] Subtítulo activado:', textTracks[textTracks.length - 1].label);
            }
            
            // Cerrar el modal
            modal.remove();
            playerLogger.log('✅ [SUBDIVX] Modal cerrado');
          }, 300);
        } else {
          playerLogger.log('❌ [SUBDIVX] No se recibieron archivos de subtítulos');
        }
      } catch (error) {
        playerLogger.log('❌ [SUBDIVX] Error:', error);
      } finally {
        isDownloadingSubdivx = false;
        downloadingSubdivxId = null;
        renderContent();
      }
    };

    // Crear modal
    const modal = document.createElement('div');
    modal.className = 'vjs-subtitle-settings-modal';
    modal.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      background-color: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: flex-end;
      justify-content: flex-end;
      padding: 1rem;
      padding-bottom: 9rem;
      pointer-events: auto;
    `;

    // Click en el backdrop (fuera del modal) para cerrar
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    };

    // Contenedor del modal
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      position: relative;
      background-color: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border-radius: 1rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      width: 100%;
      max-width: 28rem;
      height: 500px;
      max-height: 500px;
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: white;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;
    
    // Evitar que clicks en el modalContent cierren el modal
    modalContent.onclick = (e) => {
      e.stopPropagation();
    };

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    `;

    const headerTop = document.createElement('div');
    headerTop.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Subtítulos';
    title.style.cssText = `
      font-size: 1.125rem;
      font-weight: 600;
      color: white;
      margin: 0;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      padding: 0.375rem;
      border-radius: 0.5rem;
      cursor: pointer;
      border: none;
      background: transparent;
      color: rgba(255, 255, 255, 0.7);
      font-size: 1.5rem;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
    `;
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      modal.remove();
    };

    headerTop.appendChild(title);
    headerTop.appendChild(closeBtn);
    header.appendChild(headerTop);

    // Pestañas
    const tabsContainer = document.createElement('div');
    tabsContainer.style.cssText = `
      display: flex;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    `;

    const tabs = [
      { id: 'subtitles' as const, label: 'Subtítulos' },
      { id: 'opensubtitles' as const, label: 'OpenSubtitles' },
      { id: 'subdivx' as const, label: 'Subdivx' },
      { id: 'settings' as const, label: 'Configuración' }
    ];

    const tabButtons: { [key: string]: HTMLButtonElement } = {};

    tabs.forEach(tab => {
      const tabBtn = document.createElement('button');
      tabBtn.textContent = tab.label;
      tabBtn.style.cssText = `
        flex: 1;
        padding: 0.75rem 1rem;
        font-size: 0.875rem;
        font-weight: 500;
        border: none;
        cursor: pointer;
        background: transparent;
        color: rgba(255, 255, 255, 0.7);
        border-bottom: 2px solid transparent;
        transition: all 0.2s;
      `;

      if (tab.id === activeTab) {
        tabBtn.style.color = 'white';
        tabBtn.style.borderBottom = '2px solid rgb(59, 130, 246)';
        tabBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      }

      tabBtn.onclick = (e) => {
        e.stopPropagation();
        activeTab = tab.id;
        // Actualizar estilos de pestañas
        Object.values(tabButtons).forEach(btn => {
          btn.style.color = 'rgba(255, 255, 255, 0.7)';
          btn.style.borderBottom = '2px solid transparent';
          btn.style.backgroundColor = 'transparent';
        });
        tabBtn.style.color = 'white';
        tabBtn.style.borderBottom = '2px solid rgb(59, 130, 246)';
        tabBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        // Renderizar contenido
        renderContent();
      };

      tabButtons[tab.id] = tabBtn;
      tabsContainer.appendChild(tabBtn);
    });

    header.appendChild(tabsContainer);

    // Contenido dinámico
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    `;

    // Función para renderizar contenido según pestaña activa
    const renderContent = () => {
      content.innerHTML = '';

      if (activeTab === 'subtitles') {
        renderSubtitlesTab();
      } else if (activeTab === 'opensubtitles') {
        renderOpenSubtitlesTab();
      } else if (activeTab === 'subdivx') {
        renderSubdivxTab();
      } else if (activeTab === 'settings') {
        renderSettingsTab();
      }
    };

    // Renderizar pestaña de Subtítulos
    const renderSubtitlesTab = () => {
      const tracks = player.textTracks() as any;
      const tracksArray: any[] = [];
      for (let i = 0; i < tracks.length; i++) {
        tracksArray.push(tracks[i]);
      }
      const subtitleTracks = tracksArray.filter((track: any) => 
        track.kind === 'subtitles' || track.kind === 'captions'
      );
      
      // Debug log
      playerLogger.log('🔍 [MODAL-SUBTITLES] Total tracks:', tracks.length);
      playerLogger.log('🔍 [MODAL-SUBTITLES] Subtitle tracks:', subtitleTracks.length);
      playerLogger.log('🔍 [MODAL-SUBTITLES] Tracks:', subtitleTracks.map((t: any) => ({
        label: t.label,
        language: t.language,
        kind: t.kind,
        mode: t.mode
      })));

      // Mapeo de nombres de idiomas a nombre normalizado
      const languageNormalization: Record<string, string> = {
        // Español
        'spanish': 'Español',
        'español': 'Español',
        'spa': 'Español',
        'es': 'Español',
        // Inglés
        'english': 'English',
        'inglés': 'English',
        'ingles': 'English',
        'eng': 'English',
        'en': 'English',
        // Francés
        'french': 'Français',
        'francés': 'Français',
        'frances': 'Français',
        'français': 'Français',
        'fre': 'Français',
        'fra': 'Français',
        'fr': 'Français',
        // Alemán
        'german': 'Deutsch',
        'alemán': 'Deutsch',
        'aleman': 'Deutsch',
        'deutsch': 'Deutsch',
        'ger': 'Deutsch',
        'deu': 'Deutsch',
        'de': 'Deutsch',
        // Italiano
        'italian': 'Italiano',
        'ita': 'Italiano',
        'it': 'Italiano',
        // Portugués
        'portuguese': 'Português',
        'portugués': 'Português',
        'portugues': 'Português',
        'português': 'Português',
        'por': 'Português',
        'pt': 'Português',
        // Ruso
        'russian': 'Русский',
        'ruso': 'Русский',
        'rus': 'Русский',
        'ru': 'Русский',
        // Japonés
        'japanese': '日本語',
        'japonés': '日本語',
        'japones': '日本語',
        'jpn': '日本語',
        'ja': '日本語',
        // Coreano
        'korean': '한국어',
        'coreano': '한국어',
        'kor': '한국어',
        'ko': '한국어',
        // Chino
        'chinese': '中文',
        'chino': '中文',
        'chi': '中文',
        'zho': '中文',
        'zh': '中文',
        // Árabe
        'arabic': 'العربية',
        'árabe': 'العربية',
        'arabe': 'العربية',
        'ara': 'العربية',
        'ar': 'العربية',
        // Holandés
        'dutch': 'Nederlands',
        'holandés': 'Nederlands',
        'holandes': 'Nederlands',
        'dut': 'Nederlands',
        'nld': 'Nederlands',
        'nl': 'Nederlands',
        // Polaco
        'polish': 'Polski',
        'polaco': 'Polski',
        'pol': 'Polski',
        'pl': 'Polski',
        // Turco
        'turkish': 'Türkçe',
        'turco': 'Türkçe',
        'tur': 'Türkçe',
        'tr': 'Türkçe',
        // Sueco
        'swedish': 'Svenska',
        'sueco': 'Svenska',
        'swe': 'Svenska',
        'sv': 'Svenska',
        // Noruego
        'norwegian': 'Norsk',
        'noruego': 'Norsk',
        'nor': 'Norsk',
        'no': 'Norsk',
        // Danés
        'danish': 'Dansk',
        'danés': 'Dansk',
        'danes': 'Dansk',
        'dan': 'Dansk',
        'da': 'Dansk',
        // Finlandés
        'finnish': 'Suomi',
        'finlandés': 'Suomi',
        'finlandes': 'Suomi',
        'fin': 'Suomi',
        'fi': 'Suomi',
        // Griego
        'greek': 'Ελληνικά',
        'griego': 'Ελληνικά',
        'gre': 'Ελληνικά',
        'ell': 'Ελληνικά',
        'el': 'Ελληνικά',
        // Húngaro
        'hungarian': 'Magyar',
        'húngaro': 'Magyar',
        'hungaro': 'Magyar',
        'hun': 'Magyar',
        'hu': 'Magyar',
        // Checo
        'czech': 'Čeština',
        'checo': 'Čeština',
        'cze': 'Čeština',
        'ces': 'Čeština',
        'cs': 'Čeština',
        // Hebreo
        'hebrew': 'עברית',
        'hebreo': 'עברית',
        'heb': 'עברית',
        'he': 'עברית',
      };

      // Agrupar subtítulos por idioma NORMALIZADO
      const groupedByLanguage: Record<string, any[]> = {};
      subtitleTracks.forEach((track: any) => {
        // Extraer idioma del label (remover números, paréntesis, guiones finales, etc.)
        let rawLangName = track.label || track.language || 'Unknown';
        const originalLabel = rawLangName; // Para debug
        
        // Limpiar el nombre (orden importante: primero paréntesis, luego números)
        rawLangName = rawLangName
          .replace(/\s*\([^)]+\)\s*$/, '')   // 1. Remover " (fuente)" al final primero
          .replace(/\s*-\s*[^-]+\.\w+$/, '') // 2. Remover " - archivo.vtt"
          .replace(/\s+\d+$/, '')            // 3. AHORA remover " 1", " 2", etc. al final
          .split('-')[0]                     // 4. Tomar solo la primera parte antes de "-"
          .trim();
        
        // Normalizar el idioma
        const normalizedLang = languageNormalization[rawLangName.toLowerCase()] || rawLangName;
        
        // DEBUG LOG
        playerLogger.log(`🔍 [AGRUPACIÓN] "${originalLabel}" → limpio: "${rawLangName}" → normalizado: "${normalizedLang}"`);
        
        if (!groupedByLanguage[normalizedLang]) {
          groupedByLanguage[normalizedLang] = [];
        }
        groupedByLanguage[normalizedLang].push(track);
      });

      playerLogger.log('🔍 [MODAL-SUBTITLES] Agrupados:', Object.keys(groupedByLanguage).map(lang => 
        `${lang} (${groupedByLanguage[lang].length})`
      ));

      // Estado de expansión de grupos
      const expandedGroups: Set<string> = new Set();

      // Botón "Off"
      const offButton = document.createElement('div');
      offButton.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 0.5rem;
        cursor: pointer;
        transition: background 0.2s;
      `;
      offButton.onmouseenter = () => offButton.style.background = 'rgba(255, 255, 255, 0.1)';
      offButton.onmouseleave = () => offButton.style.background = 'rgba(255, 255, 255, 0.05)';
      offButton.onclick = (e) => {
        e.stopPropagation();
        tracksArray.forEach((track: any) => {
          if (track.kind === 'subtitles' || track.kind === 'captions') {
            track.mode = 'disabled';
          }
        });
        renderContent();
      };

      const offLabel = document.createElement('span');
      offLabel.textContent = 'Off';
      offLabel.style.cssText = 'color: white; font-size: 0.875rem;';

      const activeSubtitle = subtitleTracks.find((t: any) => t.mode === 'showing');
      if (!activeSubtitle) {
        const noBadge = document.createElement('span');
        noBadge.textContent = 'No Subtitles';
        noBadge.style.cssText = `
          padding: 0.25rem 0.5rem;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 0.25rem;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.7);
        `;
        offButton.appendChild(offLabel);
        offButton.appendChild(noBadge);
      } else {
        offButton.appendChild(offLabel);
      }

      content.appendChild(offButton);

      // Botón "Upload subtitles"
      const uploadButton = document.createElement('div');
      uploadButton.style.cssText = `
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 0.5rem;
        cursor: pointer;
        transition: background 0.2s;
        margin-top: 0.5rem;
      `;
      uploadButton.onmouseenter = () => uploadButton.style.background = 'rgba(255, 255, 255, 0.1)';
      uploadButton.onmouseleave = () => uploadButton.style.background = 'rgba(255, 255, 255, 0.05)';
      uploadButton.onclick = (e) => {
        e.stopPropagation();
        const uploadBtn = playerEl.querySelector('.vjs-subtitle-upload-button');
        if (uploadBtn) {
          (uploadBtn as HTMLElement).click();
        }
      };

      const uploadIcon = document.createElement('span');
      uploadIcon.innerHTML = '↑';
      uploadIcon.style.cssText = 'font-size: 1.25rem; color: rgba(255, 255, 255, 0.7);';

      const uploadLabel = document.createElement('span');
      uploadLabel.textContent = 'Upload subtitles';
      uploadLabel.style.cssText = 'color: white; font-size: 0.875rem;';

      uploadButton.appendChild(uploadIcon);
      uploadButton.appendChild(uploadLabel);
      content.appendChild(uploadButton);

      // Renderizar grupos de idiomas
      Object.entries(groupedByLanguage).forEach(([langName, tracks]) => {
        const groupContainer = document.createElement('div');
        groupContainer.style.cssText = 'margin-top: 0.5rem;';

        // Botón del grupo de idioma
        const groupButton = document.createElement('div');
        const hasActiveTrack = tracks.some((t: any) => t.mode === 'showing');
        
        groupButton.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem;
          background: ${hasActiveTrack ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)'};
          border-radius: 0.5rem;
          cursor: pointer;
          transition: all 0.2s;
          border: ${hasActiveTrack ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid transparent'};
        `;
        
        groupButton.onmouseenter = () => {
          if (!hasActiveTrack) {
            groupButton.style.background = 'rgba(255, 255, 255, 0.1)';
          }
        };
        groupButton.onmouseleave = () => {
          if (!hasActiveTrack) {
            groupButton.style.background = 'rgba(255, 255, 255, 0.05)';
          }
        };

        const leftSide = document.createElement('div');
        leftSide.style.cssText = 'display: flex; align-items: center; gap: 0.5rem;';

        // Ícono de expandir/contraer
        const expandIcon = document.createElement('span');
        expandIcon.textContent = '▸';
        expandIcon.style.cssText = `
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.5);
          transition: transform 0.2s;
        `;

        const groupLabel = document.createElement('span');
        groupLabel.textContent = langName;
        groupLabel.style.cssText = 'color: white; font-size: 0.875rem;';

        leftSide.appendChild(expandIcon);
        leftSide.appendChild(groupLabel);

        // Badge con la cantidad
        const countBadge = document.createElement('span');
        countBadge.textContent = `${tracks.length}`;
        countBadge.style.cssText = `
          padding: 0.25rem 0.5rem;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 0.25rem;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.7);
        `;

        groupButton.appendChild(leftSide);
        groupButton.appendChild(countBadge);

        // Contenedor de tracks del grupo
        const tracksContainer = document.createElement('div');
        tracksContainer.style.cssText = `
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease;
        `;

        // Si solo hay 1 subtítulo, activarlo directamente sin expandir
        if (tracks.length === 1) {
          groupButton.onclick = (e) => {
            e.stopPropagation();
            tracksArray.forEach((t: any) => {
              if (t.kind === 'subtitles' || t.kind === 'captions') {
                t.mode = 'disabled';
              }
            });
            tracks[0].mode = 'showing';
            renderContent();
          };
        } else {
          // Si hay múltiples, permitir expandir/contraer
          groupButton.onclick = (e) => {
            e.stopPropagation();
            const isExpanded = expandedGroups.has(langName);
            
            if (isExpanded) {
              expandedGroups.delete(langName);
              tracksContainer.style.maxHeight = '0';
              expandIcon.style.transform = 'rotate(0deg)';
            } else {
              expandedGroups.add(langName);
              tracksContainer.style.maxHeight = `${tracks.length * 60}px`;
              expandIcon.style.transform = 'rotate(90deg)';
            }
          };

          // Renderizar cada track del grupo
          tracks.forEach((track: any, index: number) => {
            const trackItem = document.createElement('div');
            trackItem.style.cssText = `
              display: flex;
              align-items: center;
              padding: 0.5rem 0.75rem 0.5rem 2rem;
              background: ${track.mode === 'showing' ? 'rgba(99, 102, 241, 0.15)' : 'transparent'};
              cursor: pointer;
              transition: background 0.2s;
              border-left: 2px solid ${track.mode === 'showing' ? 'rgba(99, 102, 241, 0.8)' : 'transparent'};
            `;
            
            trackItem.onmouseenter = () => {
              if (track.mode !== 'showing') {
                trackItem.style.background = 'rgba(255, 255, 255, 0.05)';
              }
            };
            trackItem.onmouseleave = () => {
              if (track.mode !== 'showing') {
                trackItem.style.background = 'transparent';
              }
            };
            
            trackItem.onclick = (e) => {
              e.stopPropagation();
              tracksArray.forEach((t: any) => {
                if (t.kind === 'subtitles' || t.kind === 'captions') {
                  t.mode = 'disabled';
                }
              });
              track.mode = 'showing';
              renderContent();
            };

            const trackLabel = document.createElement('span');
            // Mostrar solo el número secuencial dentro del grupo
            trackLabel.textContent = `${index + 1}`;
            trackLabel.style.cssText = `
              color: ${track.mode === 'showing' ? 'white' : 'rgba(255, 255, 255, 0.8)'};
              font-size: 0.8125rem;
            `;

            trackItem.appendChild(trackLabel);
            tracksContainer.appendChild(trackItem);
          });
        }

        groupContainer.appendChild(groupButton);
        if (tracks.length > 1) {
          groupContainer.appendChild(tracksContainer);
        }
        content.appendChild(groupContainer);
      });
    };

    // Renderizar pestaña de OpenSubtitles
    const renderOpenSubtitlesTab = () => {
      // Verificar si hay subtítulos precargados primero
      if (!hasSearchedOpenSubtitles && openSubtitlesResults.length === 0) {
        const preloadedSubs = getCurrentAvailableSubtitles();
        playerLogger.log('🔍 [MODAL-OPENSUBTITLES] Verificando subtítulos precargados:', preloadedSubs.length);
        if (preloadedSubs.length > 0) {
          openSubtitlesResults = preloadedSubs;
          hasSearchedOpenSubtitles = true;
          playerLogger.log('✅ [MODAL-OPENSUBTITLES] Usando subtítulos precargados:', openSubtitlesResults.length);
        } else if (!isSearchingOpenSubtitles && movieTitle) {
          // Solo buscar si no hay precargados
          playerLogger.log('🔍 [MODAL-OPENSUBTITLES] No hay precargados, iniciando búsqueda...');
          setTimeout(() => searchOpenSubtitles(), 100);
        }
      }

      // Header con botón de búsqueda
      const header = document.createElement('div');
      header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;';

      const headerTitle = document.createElement('h3');
      headerTitle.textContent = movieTitle ? `OpenSubtitles: "${movieTitle}"` : 'Búsqueda en OpenSubtitles';
      headerTitle.style.cssText = 'font-size: 0.875rem; font-weight: 500; color: rgba(255, 255, 255, 0.9); margin: 0;';

      const searchBtn = document.createElement('button');
      searchBtn.textContent = isSearchingOpenSubtitles ? 'Buscando...' : 'Refrescar';
      searchBtn.disabled = isSearchingOpenSubtitles || !movieTitle;
      searchBtn.style.cssText = `
        padding: 0.375rem 0.75rem;
        background: ${searchBtn.disabled ? 'rgba(255, 255, 255, 0.1)' : 'rgb(37, 99, 235)'};
        color: ${searchBtn.disabled ? 'rgba(255, 255, 255, 0.5)' : 'white'};
        font-size: 0.875rem;
        border-radius: 0.5rem;
        border: none;
        cursor: ${searchBtn.disabled ? 'not-allowed' : 'pointer'};
        font-weight: 500;
      `;
      searchBtn.onclick = (e) => {
        e.stopPropagation();
        if (!searchBtn.disabled) {
          hasSearchedOpenSubtitles = false;
          searchOpenSubtitles();
        }
      };

      header.appendChild(headerTitle);
      header.appendChild(searchBtn);
      content.appendChild(header);

      // Resultados
      if (isSearchingOpenSubtitles) {
        const loading = document.createElement('div');
        loading.style.cssText = 'text-align: center; padding: 2rem;';
        loading.innerHTML = `
          <div style="width: 1.5rem; height: 1.5rem; border: 2px solid rgb(59, 130, 246); border-top-color: transparent; border-radius: 50%; margin: 0 auto 0.5rem; animation: spin 1s linear infinite;"></div>
          <p style="color: rgba(255, 255, 255, 0.7); font-size: 0.875rem;">Buscando subtítulos...</p>
        `;
        content.appendChild(loading);
      } else if (openSubtitlesResults.length > 0) {
        // Agregar separadores por idioma
        let lastLanguage = '';
        
        openSubtitlesResults.forEach((subtitle, index) => {
          // Detectar cambio de idioma y agregar separador
          const currentLanguage = subtitle.language;
          if (currentLanguage !== lastLanguage && index > 0) {
            const separator = document.createElement('div');
            separator.style.cssText = 'margin: 1rem 0 0.5rem 0; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.1);';
            const separatorText = document.createElement('h4');
            separatorText.textContent = currentLanguage === 'en' || currentLanguage === 'eng' ? '🇬🇧 English' : '🌐 ' + subtitle.languageName?.split(' ')[0];
            separatorText.style.cssText = 'font-size: 0.875rem; font-weight: 600; color: rgba(255, 255, 255, 0.9); margin: 0 0 0.5rem 0;';
            separator.appendChild(separatorText);
            content.appendChild(separator);
          } else if (index === 0) {
            // Primer elemento: agregar título del idioma
            const separator = document.createElement('div');
            separator.style.cssText = 'margin: 0 0 0.5rem 0;';
            const separatorText = document.createElement('h4');
            separatorText.textContent = currentLanguage === 'es' || currentLanguage === 'spa' ? '🇪🇸 Español' : '🌐 ' + subtitle.languageName?.split(' ')[0];
            separatorText.style.cssText = 'font-size: 0.875rem; font-weight: 600; color: rgba(255, 255, 255, 0.9); margin: 0;';
            separator.appendChild(separatorText);
            content.appendChild(separator);
          }
          lastLanguage = currentLanguage;
          const item = document.createElement('div');
          item.style.cssText = 'background: rgba(255, 255, 255, 0.05); border-radius: 0.5rem; padding: 0.75rem; border: 1px solid rgba(255, 255, 255, 0.1); margin-bottom: 0.5rem; transition: background 0.2s;';
          item.onmouseenter = () => item.style.background = 'rgba(255, 255, 255, 0.1)';
          item.onmouseleave = () => item.style.background = 'rgba(255, 255, 255, 0.05)';

          const itemContent = document.createElement('div');
          itemContent.style.cssText = 'display: flex; align-items: start; justify-content: space-between;';

          const info = document.createElement('div');
          info.style.cssText = 'flex: 1; min-width: 0;';

          // Detectar el formato del subtítulo
          const isSubtitleFile = subtitle.filename && subtitle.languageName;
          
          // Obtener tracks actuales DENTRO del loop para cada subtítulo
          const textTracks = Array.from(player.textTracks() as any);
          
          // Verificar si ya está descargado: comparar el label esperado con los tracks existentes
          // Incluir el ID único en el label para diferenciar subtítulos
          const expectedLabel = isSubtitleFile 
            ? `${subtitle.languageName} - ${subtitle.filename} [${subtitle.id}]`
            : `${(subtitle.attributes?.language || '').toUpperCase()} - ${subtitle.attributes?.release || ''}`;
          
          // Marcar como descargado solo si el label coincide exactamente
          const isAlreadyDownloaded = textTracks.some((track: any) => {
            return track.label === expectedLabel;
          });

          const lang = document.createElement('div');
          lang.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;';
          const languageText = isSubtitleFile 
            ? subtitle.languageName 
            : (subtitle.attributes?.language || '').toUpperCase();
          lang.innerHTML = `<span style="color: white; font-weight: 500; font-size: 0.875rem;">${languageText}</span>${isAlreadyDownloaded ? '<span style="color: rgb(34, 197, 94); font-size: 0.75rem; font-weight: 500;">✓ Descargado</span>' : ''}`;

          const release = document.createElement('p');
          release.textContent = isSubtitleFile ? subtitle.filename : subtitle.attributes?.release || '';
          release.style.cssText = 'color: rgba(255, 255, 255, 0.7); font-size: 0.75rem; margin: 0 0 0.25rem 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

          const stats = document.createElement('div');
          stats.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; font-size: 0.75rem; color: rgba(255, 255, 255, 0.5);';
          const downloads = isSubtitleFile ? subtitle.downloads : subtitle.attributes?.download_count || 0;
          const ratings = isSubtitleFile ? 0 : subtitle.attributes?.ratings || 0;
          stats.innerHTML = `<span>↓ ${downloads}</span>${ratings > 0 ? `<span>★ ${ratings}</span>` : ''}`;

          info.appendChild(lang);
          info.appendChild(release);
          info.appendChild(stats);

          const btn = document.createElement('button');
          const isDownloading = downloadingOpenSubtitlesId === subtitle.id;
          const hasFiles = isSubtitleFile ? true : (subtitle.attributes?.files && subtitle.attributes.files.length > 0);
          btn.textContent = isDownloading ? 'Descargando...' : (isAlreadyDownloaded ? '✓ Descargado' : (!hasFiles ? 'No disponible' : 'Cargar'));
          btn.disabled = isDownloadingOpenSubtitles || !hasFiles || isAlreadyDownloaded;
          btn.style.cssText = `
            padding: 0.375rem 0.75rem;
            background: ${isDownloading ? 'rgb(202, 138, 4)' : (isAlreadyDownloaded ? 'rgb(34, 197, 94)' : (!hasFiles ? 'rgb(75, 85, 99)' : 'rgb(37, 99, 235)'))};
            color: white;
            font-size: 0.75rem;
            border-radius: 0.5rem;
            border: none;
            cursor: ${btn.disabled ? 'not-allowed' : 'pointer'};
            font-weight: 500;
            flex-shrink: 0;
          `;
          btn.onclick = (e) => {
            e.stopPropagation();
            if (!btn.disabled) downloadAndLoadOpenSubtitle(subtitle);
          };

          itemContent.appendChild(info);
          itemContent.appendChild(btn);
          item.appendChild(itemContent);
          content.appendChild(item);
        });
      } else if (!isSearchingOpenSubtitles && openSubtitlesResults.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align: center; padding: 2rem;';
        empty.innerHTML = `
          <div style="font-size: 3rem; opacity: 0.3; margin-bottom: 0.5rem;">🔍</div>
          <p style="color: rgba(255, 255, 255, 0.7); font-size: 0.875rem;">${movieTitle ? 'No se encontraron subtítulos' : 'Clickea "Buscar" para empezar'}</p>
        `;
        content.appendChild(empty);
      }
    };

    // Renderizar pestaña de Subdivx
    const renderSubdivxTab = () => {
      // Buscar automáticamente la primera vez
      playerLogger.log('🔍 [MODAL-SUBDIVX] hasSearched:', hasSearchedSubdivx, 'isSearching:', isSearchingSubdivx, 'movieTitle:', movieTitle);
      
      if (!hasSearchedSubdivx && !isSearchingSubdivx && movieTitle) {
        playerLogger.log('🔍 [MODAL-SUBDIVX] Iniciando búsqueda automática...');
        setTimeout(() => searchSubdivx(), 100);
      }

      // Header con botón de búsqueda
      const header = document.createElement('div');
      header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;';

      const headerTitle = document.createElement('h3');
      headerTitle.textContent = movieTitle ? `Subdivx: "${movieTitle}"` : 'Búsqueda en Subdivx';
      headerTitle.style.cssText = 'font-size: 0.875rem; font-weight: 500; color: rgba(255, 255, 255, 0.9); margin: 0;';

      const searchBtn = document.createElement('button');
      searchBtn.textContent = isSearchingSubdivx ? 'Buscando...' : 'Refrescar';
      searchBtn.disabled = isSearchingSubdivx || !movieTitle;
      searchBtn.style.cssText = `
        padding: 0.375rem 0.75rem;
        background: ${searchBtn.disabled ? 'rgba(255, 255, 255, 0.1)' : 'rgb(22, 163, 74)'};
        color: ${searchBtn.disabled ? 'rgba(255, 255, 255, 0.5)' : 'white'};
        font-size: 0.875rem;
        border-radius: 0.5rem;
        border: none;
        cursor: ${searchBtn.disabled ? 'not-allowed' : 'pointer'};
        font-weight: 500;
      `;
      searchBtn.onclick = (e) => {
        e.stopPropagation();
        if (!searchBtn.disabled) {
          hasSearchedSubdivx = false;
          searchSubdivx();
        }
      };

      header.appendChild(headerTitle);
      header.appendChild(searchBtn);
      content.appendChild(header);

      // Resultados
      if (isSearchingSubdivx) {
        const loading = document.createElement('div');
        loading.style.cssText = 'text-align: center; padding: 2rem;';
        loading.innerHTML = `
          <div style="width: 1.5rem; height: 1.5rem; border: 2px solid rgb(22, 163, 74); border-top-color: transparent; border-radius: 50%; margin: 0 auto 0.5rem; animation: spin 1s linear infinite;"></div>
          <p style="color: rgba(255, 255, 255, 0.7); font-size: 0.875rem;">Buscando en Subdivx...</p>
        `;
        content.appendChild(loading);
      } else if (subdivxResults.length > 0) {
        // Obtener tracks actuales para verificar cuáles ya están descargados
        const textTracks = Array.from(player.textTracks() as any);
        
        subdivxResults.forEach((result, index) => {
          const item = document.createElement('div');
          item.style.cssText = 'background: rgba(255, 255, 255, 0.05); border-radius: 0.5rem; padding: 0.75rem; border: 1px solid rgba(255, 255, 255, 0.1); margin-bottom: 0.5rem; transition: background 0.2s;';
          item.onmouseenter = () => item.style.background = 'rgba(255, 255, 255, 0.1)';
          item.onmouseleave = () => item.style.background = 'rgba(255, 255, 255, 0.05)';

          const itemContent = document.createElement('div');
          itemContent.style.cssText = 'display: flex; align-items: start; justify-content: space-between;';

          const info = document.createElement('div');
          info.style.cssText = 'flex: 1; min-width: 0;';

          // Verificar si ya está descargado comparando con los labels de los tracks
          const isAlreadyDownloaded = textTracks.some((track: any) => {
            const trackLabel = track.label || '';
            // Los subtítulos de Subdivx tienen labels que incluyen el title del resultado
            return trackLabel.includes('ES -') && result.title && trackLabel.includes(result.title.substring(0, 20));
          });

          const lang = document.createElement('div');
          lang.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;';
          lang.innerHTML = `
            <span style="color: white; font-weight: 500; font-size: 0.875rem;">ES</span>
            <span style="padding: 0.125rem 0.375rem; background: rgb(22, 163, 74); color: white; border-radius: 0.25rem; font-size: 0.75rem;">Subdivx</span>
            ${isAlreadyDownloaded ? '<span style="color: rgb(34, 197, 94); font-size: 0.75rem; font-weight: 500;">✓ Descargado</span>' : ''}
          `;

          const title = document.createElement('p');
          title.textContent = result.title;
          title.style.cssText = 'color: rgba(255, 255, 255, 0.7); font-size: 0.75rem; margin: 0 0 0.25rem 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

          const description = document.createElement('p');
          description.textContent = result.description;
          description.style.cssText = 'color: rgba(255, 255, 255, 0.5); font-size: 0.75rem; margin: 0 0 0.25rem 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

          const stats = document.createElement('div');
          stats.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; font-size: 0.75rem; color: rgba(255, 255, 255, 0.5);';
          stats.innerHTML = `
            <span>↓ ${result.downloads}</span>
            <span>★ ${result.rating}</span>
            <span>${result.date}</span>
          `;

          info.appendChild(lang);
          info.appendChild(title);
          info.appendChild(description);
          info.appendChild(stats);

          const btn = document.createElement('button');
          const isDownloading = downloadingSubdivxId === result.downloadUrl;
          btn.textContent = isDownloading ? 'Descargando...' : (isAlreadyDownloaded ? '✓ Descargado' : 'Cargar');
          btn.disabled = isDownloadingSubdivx || isAlreadyDownloaded;
          btn.style.cssText = `
            padding: 0.375rem 0.75rem;
            background: ${isDownloading ? 'rgb(202, 138, 4)' : (isAlreadyDownloaded ? 'rgb(34, 197, 94)' : 'rgb(22, 163, 74)')};
            color: white;
            font-size: 0.75rem;
            border-radius: 0.5rem;
            border: none;
            cursor: ${btn.disabled ? 'not-allowed' : 'pointer'};
            font-weight: 500;
            flex-shrink: 0;
          `;
          btn.onclick = (e) => {
            e.stopPropagation();
            if (!btn.disabled) downloadAndLoadSubdivx(result);
          };

          itemContent.appendChild(info);
          itemContent.appendChild(btn);
          item.appendChild(itemContent);
          content.appendChild(item);
        });
      } else if (!isSearchingSubdivx && subdivxResults.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align: center; padding: 2rem;';
        empty.innerHTML = `
          <div style="font-size: 3rem; opacity: 0.3; margin-bottom: 0.5rem;">🔍</div>
          <p style="color: rgba(255, 255, 255, 0.7); font-size: 0.875rem;">${movieTitle ? 'No se encontraron subtítulos' : 'Clickea "Buscar" para empezar'}</p>
        `;
        content.appendChild(empty);
      }
    };

    // Renderizar pestaña de Configuración
    const renderSettingsTab = () => {
      const currentSettings = playerState.subtitleSettings;
      let offset = currentSettings.offset || 0;
      let fontPercent = currentSettings.fontPercent || 1.0;
      let textColor = currentSettings.textColor || '#FFFFFF';
      let backgroundColor = currentSettings.backgroundColor || '#000000';
      let backgroundOpacity = currentSettings.backgroundOpacity ?? 0.75;
      let fontFamily = currentSettings.fontFamily || 'Arial, sans-serif';
      let position = currentSettings.position || 'bottom';

      // --- Sincronización ---
      const syncSection = document.createElement('div');
      syncSection.style.cssText = 'display: flex; flex-direction: column; gap: 0.75rem;';

      const syncTitle = document.createElement('h3');
      syncTitle.textContent = 'Sincronización';
      syncTitle.style.cssText = 'font-size: 0.875rem; font-weight: 500; color: rgba(255, 255, 255, 0.9); margin: 0;';

      const syncControls = document.createElement('div');
      syncControls.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 0.25rem;';

      const offsetDisplay = document.createElement('div');
      offsetDisplay.style.cssText = 'flex: 1; text-align: center; min-width: 70px; max-width: 80px; color: white; font-weight: bold; font-size: 1rem;';
      offsetDisplay.textContent = `${offset >= 0 ? '+' : ''}${offset.toFixed(1)}s`;

      const buttonStyle = 'padding: 0.375rem 0.5rem; background-color: rgba(255, 255, 255, 0.1); color: white; font-size: 0.75rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 500; flex-shrink: 0; transition: background-color 0.2s;';

      const createOffsetButton = (text: string, delta: number) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = buttonStyle;
        btn.onmouseenter = () => btn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        btn.onmouseleave = () => btn.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        btn.onclick = (e) => {
          e.stopPropagation();
          offset += delta;
          offsetDisplay.textContent = `${offset >= 0 ? '+' : ''}${offset.toFixed(1)}s`;
          applySubtitleSettings({ ...currentSettings, offset });
        };
        return btn;
      };

      syncControls.appendChild(createOffsetButton('-0.5s', -0.5));
      syncControls.appendChild(createOffsetButton('-0.1s', -0.1));
      syncControls.appendChild(offsetDisplay);
      syncControls.appendChild(createOffsetButton('+0.1s', 0.1));
      syncControls.appendChild(createOffsetButton('+0.5s', 0.5));

      syncSection.appendChild(syncTitle);
      syncSection.appendChild(syncControls);
      content.appendChild(syncSection);

      // --- Tamaño de fuente ---
      const sizeSection = document.createElement('div');
      sizeSection.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;';

      const sizeHeader = document.createElement('div');
      sizeHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

      const sizeTitle = document.createElement('h3');
      sizeTitle.textContent = 'Tamaño';
      sizeTitle.style.cssText = 'font-size: 0.875rem; font-weight: 500; color: rgba(255, 255, 255, 0.9); margin: 0;';

      const sizeValue = document.createElement('span');
      sizeValue.textContent = `${Math.round(fontPercent * 100)}%`;
      sizeValue.style.cssText = 'font-size: 0.875rem; color: rgba(255, 255, 255, 0.7);';

      const sizeSlider = document.createElement('input');
      sizeSlider.type = 'range';
      sizeSlider.min = '0.5';
      sizeSlider.max = '2.0';
      sizeSlider.step = '0.1';
      sizeSlider.value = fontPercent.toString();
      sizeSlider.style.cssText = 'width: 100%; height: 0.5rem; background: rgba(255, 255, 255, 0.2); border-radius: 0.5rem; cursor: pointer;';
      sizeSlider.oninput = () => {
        fontPercent = parseFloat(sizeSlider.value);
        sizeValue.textContent = `${Math.round(fontPercent * 100)}%`;
        applySubtitleSettings({ ...currentSettings, fontPercent });
      };

      sizeHeader.appendChild(sizeTitle);
      sizeHeader.appendChild(sizeValue);
      sizeSection.appendChild(sizeHeader);
      sizeSection.appendChild(sizeSlider);
      content.appendChild(sizeSection);

      // --- Colores ---
      const colorsSection = document.createElement('div');
      colorsSection.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-top: 0.5rem;';

      // Color de texto
      const textColorSection = document.createElement('div');
      textColorSection.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem;';

      const textColorTitle = document.createElement('h3');
      textColorTitle.textContent = 'Color';
      textColorTitle.style.cssText = 'font-size: 0.875rem; font-weight: 500; color: rgba(255, 255, 255, 0.9); margin: 0;';

      const textColorPicker = document.createElement('input');
      textColorPicker.type = 'color';
      textColorPicker.value = textColor;
      textColorPicker.style.cssText = 'width: 100%; height: 2.5rem; border-radius: 0.5rem; cursor: pointer; border: 1px solid rgba(255, 255, 255, 0.2); background: transparent;';
      textColorPicker.onchange = () => {
        textColor = textColorPicker.value;
        applySubtitleSettings({ ...currentSettings, textColor });
      };

      textColorSection.appendChild(textColorTitle);
      textColorSection.appendChild(textColorPicker);

      // Color de fondo con opacidad
      const bgColorSection = document.createElement('div');
      bgColorSection.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem;';

      const bgColorTitle = document.createElement('h3');
      bgColorTitle.textContent = 'Fondo';
      bgColorTitle.style.cssText = 'font-size: 0.875rem; font-weight: 500; color: rgba(255, 255, 255, 0.9); margin: 0;';

      const bgColorPicker = document.createElement('input');
      bgColorPicker.type = 'color';
      bgColorPicker.value = backgroundColor;
      bgColorPicker.style.cssText = 'width: 100%; height: 2rem; border-radius: 0.5rem; cursor: pointer; border: 1px solid rgba(255, 255, 255, 0.2); background: transparent;';
      bgColorPicker.onchange = () => {
        backgroundColor = bgColorPicker.value;
        applySubtitleSettings({ ...currentSettings, backgroundColor });
      };

      const bgOpacitySlider = document.createElement('input');
      bgOpacitySlider.type = 'range';
      bgOpacitySlider.min = '0';
      bgOpacitySlider.max = '1';
      bgOpacitySlider.step = '0.05';
      bgOpacitySlider.value = backgroundOpacity.toString();
      bgOpacitySlider.style.cssText = 'width: 100%; height: 0.4rem; background: rgba(255, 255, 255, 0.2); border-radius: 0.5rem; cursor: pointer;';
      bgOpacitySlider.oninput = () => {
        backgroundOpacity = parseFloat(bgOpacitySlider.value);
        applySubtitleSettings({ ...currentSettings, backgroundOpacity });
      };

      bgColorSection.appendChild(bgColorTitle);
      bgColorSection.appendChild(bgColorPicker);
      bgColorSection.appendChild(bgOpacitySlider);

      colorsSection.appendChild(textColorSection);
      colorsSection.appendChild(bgColorSection);
      content.appendChild(colorsSection);

      // --- Fuente y Posición ---
      const fontPosSection = document.createElement('div');
      fontPosSection.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-top: 0.5rem;';

      // Fuente
      const fontSection = document.createElement('div');
      fontSection.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem;';

      const fontTitle = document.createElement('h3');
      fontTitle.textContent = 'Fuente';
      fontTitle.style.cssText = 'font-size: 0.875rem; font-weight: 500; color: rgba(255, 255, 255, 0.9); margin: 0;';

      const fontSelect = document.createElement('select');
      fontSelect.style.cssText = 'width: 100%; padding: 0.5rem; background: rgba(255, 255, 255, 0.1); color: white; font-size: 0.875rem; border-radius: 0.5rem; border: 1px solid rgba(255, 255, 255, 0.2); cursor: pointer;';
      const fonts = [
        { value: 'Arial, sans-serif', label: 'Arial' },
        { value: "'Courier New', monospace", label: 'Courier' },
        { value: 'Georgia, serif', label: 'Georgia' },
        { value: "'Times New Roman', serif", label: 'Times' },
        { value: 'Verdana, sans-serif', label: 'Verdana' }
      ];
      fonts.forEach(font => {
        const option = document.createElement('option');
        option.value = font.value;
        option.textContent = font.label;
        option.style.cssText = 'color: black; background: white;';
        if (font.value === fontFamily) option.selected = true;
        fontSelect.appendChild(option);
      });
      fontSelect.onchange = () => {
        fontFamily = fontSelect.value;
        applySubtitleSettings({ ...currentSettings, fontFamily });
      };

      fontSection.appendChild(fontTitle);
      fontSection.appendChild(fontSelect);

      // Posición
      const posSection = document.createElement('div');
      posSection.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem;';

      const posTitle = document.createElement('h3');
      posTitle.textContent = 'Posición';
      posTitle.style.cssText = 'font-size: 0.875rem; font-weight: 500; color: rgba(255, 255, 255, 0.9); margin: 0;';

      const posButtons = document.createElement('div');
      posButtons.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.25rem;';

      const createPosButton = (text: string, value: 'top' | 'bottom') => {
        const btn = document.createElement('button');
        btn.textContent = text;
        const isActive = position === value;
        btn.style.cssText = `
          padding: 0.375rem 0.5rem;
          font-size: 0.75rem;
          border-radius: 0.25rem;
          border: none;
          cursor: pointer;
          transition: background-color 0.2s;
          ${isActive ? 'background-color: rgb(37, 99, 235); color: white;' : 'background-color: rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.7);'}
        `;
        btn.onclick = () => {
          position = value;
          applySubtitleSettings({ ...currentSettings, position });
          renderContent();
        };
        return btn;
      };

      posButtons.appendChild(createPosButton('Abajo', 'bottom'));
      posButtons.appendChild(createPosButton('Arriba', 'top'));

      posSection.appendChild(posTitle);
      posSection.appendChild(posButtons);

      fontPosSection.appendChild(fontSection);
      fontPosSection.appendChild(posSection);
      content.appendChild(fontPosSection);
    };

    // Renderizar contenido inicial
    renderContent();

    // Ensamblar modal
    modalContent.appendChild(header);
    modalContent.appendChild(content);
    modal.appendChild(modalContent);
    playerEl.appendChild(modal);

    playerLogger.log('🎛️ [SUBTITLES] Modal nativo abierto con pestañas');
  }, [playerState.subtitleSettings, applySubtitleSettings]);

  // Cerrar modal de configuración de subtítulos
  const closeSubtitleSettings = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    const playerEl = player.el();
    if (!playerEl) return;

    const modal = playerEl.querySelector('.vjs-subtitle-settings-modal');
    if (modal) {
      modal.remove();
    }
  }, []);

  // Función para cargar subtítulos confirmados desde el VPS
  const loadConfirmedSubtitles = useCallback(async () => {
    if (!imdbId && !tmdbId) {
      playerLogger.log('⚠️ [CONFIRMED-SUBTITLES] No hay imdbId ni tmdbId disponible');
      return;
    }

    try {
      playerLogger.log('🔍 [CONFIRMED-SUBTITLES] Buscando subtítulos confirmados...');
      
      const response = await fetch('/api/subtitles/load-confirmed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imdbId,
          tmdbId,
          season,
          episode,
          isTV,
          movieHash
        }),
      });

      if (!response.ok) {
        playerLogger.log('ℹ️ [CONFIRMED-SUBTITLES] No se encontraron subtítulos confirmados');
        return;
      }

      const data = await response.json();
      
      if (data.success && data.data && data.data.confirmedSubtitles && data.data.confirmedSubtitles.length > 0) {
        playerLogger.log(`✅ [CONFIRMED-SUBTITLES] Encontrados ${data.data.confirmedSubtitles.length} subtítulos confirmados`);
        
        // Agregar cada subtítulo confirmado al reproductor
        data.data.confirmedSubtitles.forEach((subtitleRecord: any, index: number) => {
          if (subtitleRecord.subtitle && subtitleRecord.subtitle.src) {
            addSubtitleFromUrl(
              subtitleRecord.subtitle.src,
              subtitleRecord.subtitle.language || 'es',
              subtitleRecord.subtitle.language || 'Español'
            );
            playerLogger.log(`📥 [CONFIRMED-SUBTITLES] Subtítulo agregado: ${subtitleRecord.subtitle.language} - ${subtitleRecord.subtitle.src}`);
          }
        });
      } else {
        playerLogger.log('ℹ️ [CONFIRMED-SUBTITLES] No hay subtítulos confirmados disponibles');
      }
    } catch (error) {
      playerLogger.error('❌ [CONFIRMED-SUBTITLES] Error cargando subtítulos confirmados:', error);
    }
  }, [imdbId, tmdbId, season, episode, isTV, movieHash, addSubtitleFromUrl]);

  // useEffect principal - inicializar cuando cambia streamUrl
  useEffect(() => {
    // Si no hay streamUrl, limpiar el reproductor existente
    if (!streamUrl) {
      if (playerRef.current) {
        try {
          playerRef.current.dispose();
          playerLogger.log('🧹 [PLAYER] Reproductor limpiado (sin URL)');
        } catch (error) {
          playerLogger.warn('⚠️ [PLAYER] Error disposing player:', error);
        }
        playerRef.current = null;
      }
      setPlayerState(prev => ({ ...prev, isLoading: false, duration: null }));
      return;
    }

    if (!videoRef.current) return;

    playerLogger.log('🎬 [PLAYER] Iniciando reproductor con URL:', streamUrl);
    setPlayerState(prev => ({ ...prev, isLoading: true }));

    // Limpiar reproductor existente
    if (playerRef.current) {
      try {
        playerRef.current.dispose();
      } catch (error) {
        playerLogger.warn('⚠️ [PLAYER] Error disposing player:', error);
      }
      playerRef.current = null;
    }

    // Limpiar elemento de video
    const videoElement = videoRef.current;
    while (videoElement.firstChild) {
      videoElement.removeChild(videoElement.firstChild);
    }

    // Cargar plugin de Chromecast dinámicamente (solo en cliente)
    const loadChromecast = async (): Promise<boolean> => {
      if (typeof window !== 'undefined') {
        try {
          playerLogger.log('🔍 [CHROMECAST] User Agent:', navigator.userAgent);
          
          // CRÍTICO: Asegurarse de que videojs esté disponible globalmente antes de cargar el plugin
          if (typeof videojs === 'undefined') {
            logger.error('❌ [CHROMECAST] Video.js no está disponible globalmente');
            return false;
          }
          
          // Hacer videojs disponible globalmente para el plugin
          (window as any).videojs = videojs;
          playerLogger.log('✅ [CHROMECAST] Video.js disponible globalmente');
          
          // CRÍTICO: Configurar el handler del Cast SDK ANTES de cargar el plugin
          // Esto es requerido por el Google Cast SDK
          if (!(window as any).__onGCastApiAvailable) {
            (window as any).__onGCastApiAvailable = function(isAvailable: boolean) {
              playerLogger.log(`🎯 [CHROMECAST] Cast API disponible: ${isAvailable}`);
              if (isAvailable) {
                try {
                  // Verificar que cast.framework esté disponible
                  if (!(window as any).cast?.framework?.CastContext) {
                    playerLogger.warn('⚠️ [CHROMECAST] cast.framework.CastContext no disponible');
                    return;
                  }
                  
                  // Inicializar el CastContext con configuración básica
                  const castContext = (window as any).cast.framework.CastContext.getInstance();
                  
                  // Verificar que el CastContext se haya inicializado correctamente
                  if (!castContext || typeof castContext.setOptions !== 'function') {
                    playerLogger.warn('⚠️ [CHROMECAST] CastContext no válido o sin método setOptions');
                    return;
                  }
                  
                  castContext.setOptions({
                    receiverApplicationId: 'CC1AD845', // Default Media Receiver
                    autoJoinPolicy: (window as any).cast.AutoJoinPolicy.ORIGIN_SCOPED
                  });
                  
                  playerLogger.log('✅ [CHROMECAST] CastContext inicializado correctamente');
                } catch (error) {
                  logger.error('❌ [CHROMECAST] Error inicializando CastContext:', error);
                }
              }
            };
            playerLogger.log('✅ [CHROMECAST] Handler __onGCastApiAvailable configurado');
          }
          
          // Verificar si el plugin ya está registrado para evitar re-registro
          if (videojs.getPlugin('chromecast')) {
            playerLogger.log('✅ [CHROMECAST] Plugin ya registrado, reutilizando');
            return true;
          }
          
          // @ts-ignore - No hay tipos para este módulo
          const chromecastPlugin = await import('@silvermine/videojs-chromecast');
          // @ts-ignore
          await import('@silvermine/videojs-chromecast/dist/silvermine-videojs-chromecast.css');
          
          // Registrar el plugin
          if (chromecastPlugin.default) {
            chromecastPlugin.default(videojs);
          }
          
          playerLogger.log('✅ [CHROMECAST] Plugin Silvermine cargado');
          
          return true;
        } catch (error) {
          logger.error('❌ [CHROMECAST] No se pudo cargar el plugin:', error);
          return false;
        }
      }
      return false;
    };

    // Pequeño delay para asegurar que el DOM esté listo
    const timer = setTimeout(async () => {
      if (!videoRef.current) return;

      // Cargar Chromecast antes de inicializar el player (solo si no está ya cargado)
      const chromecastLoaded = await loadChromecast();

      try {
        // Configuración base de Video.js
        const USE_HLS_PROXY = (() => {
          const byEnv = typeof process !== 'undefined' && (process.env?.NEXT_PUBLIC_ENABLE_HLS_PROXY === 'true');
          const byHost = typeof window !== 'undefined' && (
            window.location.hostname === '72.60.251.132' ||
            window.location.hostname === 'api.tester1337.online'
          );
          return byEnv || byHost;
        })();

        // Detectar si estamos usando el nuevo proxy local basado en navegador
        const IS_BROWSER_PROXY = (() => {
          const s = typeof streamUrl === 'string' ? streamUrl : '';
          return s.startsWith('/api/hls-browser-proxy/');
        })();

        // Base canónica: si streamUrl viene como "/dominio/...", reconstruir a absoluta
        const BASE_STREAM_URL: string | null = (() => {
          if (!streamUrl || typeof streamUrl !== 'string') return null;
          const s = streamUrl.trim();
          if (/^https?:\/\//i.test(s)) return s;
          // Caso especial: rutas del tipo "/stormgleam42.xyz/...."
          const m = s.match(/^\/?([a-zA-Z0-9.-]+)(\/.*)$/);
          if (m) {
            const host = m[1];
            const rest = m[2] || '';
            return `https://${host}${rest}`;
          }
          return s;
        })();

        const playerOptions: any = {
          controls: true,
          responsive: true,
          fluid: true,
          autoplay: true,
          muted: false, // No silenciado por defecto, el usuario puede ajustar
          playbackRates: [0.5, 1, 1.25, 1.5, 2],
          inactivityTimeout: 3000,
          // CRÍTICO: Revertir a configuración original que funcionaba
          techOrder: ['chromecast', 'html5'],
          html5: {
            vhs: {
              overrideNative: true,
              // Evitar stalls iniciales arrancando con bitrate bajo
              enableLowInitialBitrate: true,
              limitRenditionByPlayerDimensions: false,
              maxPlaylistRetries: 10,
              retryDelay: 3000,
              xhr: {
                beforeRequest: (opts: any) => {
                  try {
                    const raw: string = opts?.uri || opts?.url || '';
                    if (!raw) return opts;

                    // No tocar rutas de nuestros proxies locales
                    if (typeof raw === 'string' && (raw.startsWith('/api/cors-proxy') || raw.startsWith('/api/hls-browser-proxy/'))) {
                      return opts;
                    }

                    let target = raw;
                    // Resolver URLs relativas (incluye las que empiezan con "/" y las relativas a directorio)
                    if (
                      typeof target === 'string' &&
                      !/^https?:\/\//i.test(target) &&
                      typeof BASE_STREAM_URL === 'string' &&
                      /^https?:\/\//i.test(BASE_STREAM_URL)
                    ) {
                      try {
                        target = new URL(target, BASE_STREAM_URL!).toString();
                      } catch {}
                    }

                    // Aplicar viejo proxy solo para URLs absolutas externas, nunca para nuestro proxy local
                    if (!IS_BROWSER_PROXY && USE_HLS_PROXY && typeof target === 'string' && /^https?:\/\//i.test(target)) {
                      const origin = new URL(target).origin + '/';
                      const proxied = `/api/cors-proxy?url=${encodeURIComponent(target)}&ref=${encodeURIComponent(origin)}&forceRef=1`;
                      opts.uri = proxied;
                      opts.url = proxied;
                    }
                  } catch {}
                  return opts;
                },
              },
            },
            nativeVideoTracks: false,
            nativeAudioTracks: false,
            nativeTextTracks: false,
          },
          controlBar: {
            children: [
              // Fila 1: tiempo actual + barra de progreso + duración
              'currentTimeDisplay',
              'progressControl',
              'durationDisplay',
              
              // Fila 2: play + volumen (izquierda), título (centro), resto (derecha)
              'playToggle',
              {
                name: 'volumePanel',
                inline: true,
              },
              'subtitlesButton',
              'chromecastButton',
              'fullscreenToggle',
            ],
          },
          textTrackSettings: {
            backgroundColor: '#000000',
            backgroundOpacity: '0.5',
            color: '#FFFFFF',
            edgeStyle: 'uniform',
            fontFamily: 'Arial, sans-serif',
            fontSize: '16px',
            textOpacity: '1',
            windowColor: '#000000',
            windowOpacity: '0',
          },
        };

        // Crear instancia de VideoJS
        playerRef.current = videojs(videoRef.current, playerOptions);

        playerLogger.log('✅ [PLAYER] Instancia creada');

        const player = playerRef.current;
        
        // Inicializar plugin de sincronización de subtítulos
        player.ready(() => {
          // Esperar a que el control bar esté disponible antes de inicializar el plugin
          try {
            const cb = (player as any).controlBar;
            if (cb && cb.el()) {
              let title = cb.el().querySelector('.netflix-title-inbar') as HTMLElement | null;
              if (!title) {
                title = document.createElement('div');
                title.className = 'netflix-title-inbar';
                cb.el().appendChild(title);
              }
              const isTv = Boolean(isTV);
              const hasSeason = typeof season === 'number' && !isNaN(Number(season));
              const hasEpisode = typeof episode === 'number' && !isNaN(Number(episode));
              
              // Limpiar el título: remover cualquier formato S##E## existente
              const cleanTitle = (movieTitle || '').replace(/\s*S\d+E\d+\s*$/i, '').trim();
              
              const label = isTv && hasSeason && hasEpisode
                ? `${cleanTitle} - S${season} E${episode}`
                : isTv && hasEpisode
                  ? `${cleanTitle} - E${episode}`
                  : `${movieTitle || ''}`;
              title.textContent = label.trim();
              
              // 🎯 CENTRADO PIXEL-PERFECT: Crear wrappers y centrar con JS
              // Esperar a que todos los plugins creen sus botones
              const setupPixelPerfectCenter = () => {
                const controlBarEl = cb.el() as HTMLElement;
                
                // 🔒 [FIX] Verificar que el elemento exista antes de continuar
                if (!controlBarEl) {
                  playerLogger.log('⚠️ [TITLE] controlBarEl es null, componente desmontado');
                  return;
                }
                
                // Verificar que existan los botones antes de reorganizar
                const playBtn = controlBarEl.querySelector('.vjs-play-control');
                const backwardBtn = controlBarEl.querySelector('.vjs-skip-backward-button');
                const forwardBtn = controlBarEl.querySelector('.vjs-skip-forward-button');
                const volumePanel = controlBarEl.querySelector('.vjs-volume-panel');
                const subsBtn = controlBarEl.querySelector('.vjs-subtitles-button');
                const episodeBtn = controlBarEl.querySelector('.vjs-episode-selector-button');
                const nextEpisodeBtn = controlBarEl.querySelector('.vjs-next-episode-button');
                const audioBtn = controlBarEl.querySelector('.vjs-audio-selector-button');
                const fullscreenBtn = controlBarEl.querySelector('.vjs-fullscreen-control');
                
                playerLogger.log('🔍 [TITLE] Botones encontrados:', {
                  play: !!playBtn,
                  backward: !!backwardBtn,
                  forward: !!forwardBtn,
                  volume: !!volumePanel,
                  subs: !!subsBtn,
                  episode: !!episodeBtn,
                  nextEpisode: !!nextEpisodeBtn,
                  audio: !!audioBtn,
                  fullscreen: !!fullscreenBtn
                });
                
                // Si faltan botones críticos, reintentar
                if (!playBtn || !backwardBtn || !forwardBtn) {
                  playerLogger.log('⏳ [TITLE] Esperando a que se creen los botones de skip...');
                  setTimeout(setupPixelPerfectCenter, 200);
                  return;
                }
                
                // Crear wrapper para fila 2 si no existe
                let row2 = controlBarEl.querySelector('.cpt-row-2') as HTMLElement;
                if (!row2) {
                  row2 = document.createElement('div');
                  row2.className = 'cpt-row-2';
                  controlBarEl.appendChild(row2);
                }
                
                // Crear grupo izquierda
                let leftGroup = row2.querySelector('.cpt-row-2-left') as HTMLElement;
                if (!leftGroup) {
                  leftGroup = document.createElement('div');
                  leftGroup.className = 'cpt-row-2-left';
                  row2.appendChild(leftGroup);
                }
                
                // Mover botones izquierda al grupo
                const leftButtons = [playBtn, backwardBtn, forwardBtn, volumePanel].filter(Boolean);
                leftButtons.forEach(btn => {
                  if (btn && btn.parentElement !== leftGroup) {
                    leftGroup.appendChild(btn as Node);
                  }
                });
                
                // Mover título a row2
                if (title.parentElement !== row2) {
                  title.className = 'cpt-row-2-title';
                  row2.appendChild(title);
                }
                
                // Crear grupo derecha
                let rightGroup = row2.querySelector('.cpt-row-2-right') as HTMLElement;
                if (!rightGroup) {
                  rightGroup = document.createElement('div');
                  rightGroup.className = 'cpt-row-2-right';
                  row2.appendChild(rightGroup);
                }
                
                // Mover botones derecha al grupo (orden correcto: subs, episodios, next, audio, fullscreen)
                const rightButtons = [subsBtn, episodeBtn, nextEpisodeBtn, audioBtn, fullscreenBtn].filter(Boolean);
                rightButtons.forEach(btn => {
                  if (btn && btn.parentElement !== rightGroup) {
                    rightGroup.appendChild(btn as Node);
                  }
                });
                
                // Función para centrar pixel-perfect
                const recenterTitle = () => {
                  const leftWidth = leftGroup.getBoundingClientRect().width;
                  const rightWidth = rightGroup.getBoundingClientRect().width;
                  const delta = (leftWidth - rightWidth) / 2;
                  // Combinar translateX con translateY para mantener centrado vertical
                  title.style.transform = `translate(calc(-50% - ${delta}px), -50%)`;
                  playerLogger.log(`🎯 [TITLE] Centrado: L=${leftWidth}px, R=${rightWidth}px, Δ=${delta}px`);
                };
                
                // Centrar ahora y en resize
                setTimeout(recenterTitle, 100);
                window.addEventListener('resize', recenterTitle);
                
                playerLogger.log('✅ [TITLE] Estructura de fila 2 creada y centrada');
              };
              
              // Iniciar el proceso de centrado
              setTimeout(setupPixelPerfectCenter, 500);
            }
          } catch (e) {
            playerLogger.log('❌ [TITLE] Error:', e);
          }
          const initSubtitleSync = () => {
            // Usar type assertion para acceder a controlBar de forma segura
            const playerWithControlBar = player as any;
            if (!playerWithControlBar.controlBar || !playerWithControlBar.controlBar.el()) {
              setTimeout(initSubtitleSync, 100);
              return;
            }
            
            // @ts-ignore - El plugin se registra en VideoJSSubtitleSyncPlugin.js
            if (typeof (player as any).subtitleSync === 'function') {
              (player as any).subtitleSync();
              playerLogger.log('✅ [SUBTITLE-SYNC] Plugin inicializado');
            }
          };
          
          // Reemplazar iconos con nuevos SVG y forzar tamaños
          const replaceIcons = () => {
            const playerEl = player.el();
            if (!playerEl) return;
            
            // Play icon (determinar estado inicial basado en autoplay)
            const playBtn = playerEl.querySelector('.vjs-play-control');
            const playPlaceholder = playBtn?.querySelector('.vjs-icon-placeholder');
            if (playBtn && playPlaceholder) {
              // Establecer icono correcto basado en el estado actual
              const isPlaying = !player.paused();
              const iconHTML = isPlaying
                ? `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.5 3a.5.5 0 0 0-.5.5v17a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-17a.5.5 0 0 0-.5-.5h-5Zm10 0a.5.5 0 0 0-.5.5v17a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-17a.5.5 0 0 0-.5-.5h-5Z" fill="currentColor"></path></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" style="transform: translateX(5%);"><path fill="currentColor" d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"></path></svg>`;
              
              playPlaceholder.innerHTML = iconHTML;
              (playBtn as HTMLElement).style.cssText = 'width: 72px !important; height: 72px !important; min-width: 72px !important; min-height: 72px !important;';
              const svg = playPlaceholder.querySelector('svg');
              if (svg) {
                svg.style.width = '36px';
                svg.style.height = '36px';
              }
            }
            
            // Volume icon
            const volumeBtn = playerEl.querySelector('.vjs-mute-control');
            const volumePlaceholder = volumeBtn?.querySelector('.vjs-icon-placeholder');
            if (volumeBtn && volumePlaceholder) {
              volumePlaceholder.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M24 12a14 14 0 0 0-4.1-9.9l-1.415 1.415a12 12 0 0 1 0 16.97L19.9 21.9A14 14 0 0 0 24 12ZM11 4a1 1 0 0 0-1.707-.707L4.586 8H1a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3.586l4.707 4.707A1 1 0 0 0 11 20V4ZM5.707 9.707 9 6.414v11.172l-3.293-3.293L5.414 14H2v-4h3.414l.293-.293ZM16 12a6 6 0 0 0-1.757-4.243l-1.415 1.415a4 4 0 0 1 0 5.656l1.415 1.415A6 6 0 0 0 16 12Zm1.07-7.071a10 10 0 0 1 0 14.142l-1.413-1.414a8 8 0 0 0 0-11.314L17.07 4.93Z" fill="currentColor"></path></svg>`;
              (volumeBtn as HTMLElement).style.cssText = 'width: 72px !important; height: 72px !important; min-width: 72px !important; min-height: 72px !important;';
              const svg = volumePlaceholder.querySelector('svg');
              if (svg) {
                svg.style.width = '36px';
                svg.style.height = '36px';
              }
            }
            
            // Fullscreen icon (enter)
            const fullscreenBtn = playerEl.querySelector('.vjs-fullscreen-control');
            const fullscreenPlaceholder = fullscreenBtn?.querySelector('.vjs-icon-placeholder');
            if (fullscreenBtn && fullscreenPlaceholder) {
              fullscreenPlaceholder.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 5a2 2 0 0 1 2-2h7v2H2v4H0V5Zm22 0h-7V3h7a2 2 0 0 1 2 2v4h-2V5ZM2 15v4h7v2H2a2 2 0 0 1-2-2v-4h2Zm20 4v-4h2v4a2 2 0 0 1-2 2h-7v-2h7Z" fill="currentColor"></path></svg>`;
              (fullscreenBtn as HTMLElement).style.cssText = 'width: 72px !important; height: 72px !important; min-width: 72px !important; min-height: 72px !important;';
              const svg = fullscreenPlaceholder.querySelector('svg');
              if (svg) {
                svg.style.width = '36px';
                svg.style.height = '36px';
              }
            }
            
            // Subtitles icon (configuration)
            const subsBtn = playerEl.querySelector('.vjs-subtitles-button');
            const subsPlaceholder = subsBtn?.querySelector('.vjs-icon-placeholder');
            if (subsBtn && subsPlaceholder) {
              subsPlaceholder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
              (subsBtn as HTMLElement).style.cssText = 'width: 72px !important; height: 72px !important; min-width: 72px !important; min-height: 72px !important;';
              const svg = subsPlaceholder.querySelector('svg');
              if (svg) {
                svg.style.width = '36px';
                svg.style.height = '36px';
              }
            }
            
            // Aplicar tamaños a botones CC+ (subtitle upload)
            const ccBtn = playerEl.querySelector('.vjs-subtitle-upload-button');
            const ccPlaceholder = ccBtn?.querySelector('.vjs-icon-placeholder');
            if (ccBtn && ccPlaceholder) {
              (ccBtn as HTMLElement).style.cssText = 'width: 72px !important; height: 72px !important; min-width: 72px !important; min-height: 72px !important;';
              const svg = ccPlaceholder.querySelector('svg');
              if (svg) {
                svg.style.width = '36px';
                svg.style.height = '36px';
              }
            }
            
            const episodeBtn = playerEl.querySelector('.vjs-episode-selector-button');
            if (episodeBtn) {
              (episodeBtn as HTMLElement).style.cssText = 'width: 72px !important; height: 72px !important; min-width: 72px !important; min-height: 72px !important;';
              const svg = episodeBtn.querySelector('svg');
              if (svg) {
                svg.style.width = '36px';
                svg.style.height = '36px';
              }
            }
            
            // Audio Selector Button
            const audioBtn = playerEl.querySelector('.vjs-audio-selector-button');
            if (audioBtn) {
              (audioBtn as HTMLElement).style.cssText = 'width: 72px !important; height: 72px !important; min-width: 72px !important; min-height: 72px !important;';
              const svg = audioBtn.querySelector('svg');
              if (svg) {
                svg.style.width = '36px';
                svg.style.height = '36px';
              }
            }
            
            // Skip Backward Button
            const skipBackwardBtn = playerEl.querySelector('.vjs-skip-backward-button');
            const skipBackwardPlaceholder = skipBackwardBtn?.querySelector('.vjs-icon-placeholder');
            if (skipBackwardBtn && skipBackwardPlaceholder) {
              (skipBackwardBtn as HTMLElement).style.cssText = 'width: 72px !important; height: 72px !important; min-width: 72px !important; min-height: 72px !important;';
              const svg = skipBackwardPlaceholder.querySelector('svg');
              if (svg) {
                svg.style.width = '36px';
                svg.style.height = '36px';
              }
            }
            
            // Skip Forward Button
            const skipForwardBtn = playerEl.querySelector('.vjs-skip-forward-button');
            const skipForwardPlaceholder = skipForwardBtn?.querySelector('.vjs-icon-placeholder');
            if (skipForwardBtn && skipForwardPlaceholder) {
              (skipForwardBtn as HTMLElement).style.cssText = 'width: 72px !important; height: 72px !important; min-width: 72px !important; min-height: 72px !important;';
              const svg = skipForwardPlaceholder.querySelector('svg');
              if (svg) {
                svg.style.width = '36px';
                svg.style.height = '36px';
              }
            }
            
            // Volume panel
            const volumePanel = playerEl.querySelector('.vjs-volume-panel');
            if (volumePanel) {
              (volumePanel as HTMLElement).style.height = '72px';
              (volumePanel as HTMLElement).style.minHeight = '72px';
              (volumePanel as HTMLElement).style.maxHeight = '72px';
            }
            
            // Función para actualizar icono de volumen según estado
            const updateVolumeIcon = () => {
              if (!volumePlaceholder) return;
              
              if (player.muted() || player.volume() === 0) {
                // Icono muteado
                volumePlaceholder.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none"><path fill="currentColor" fill-rule="evenodd" d="M11 4a1 1 0 0 0-1.7-.7L4.58 8H1a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3.59l4.7 4.7A1 1 0 0 0 11 20zM5.7 9.7 9 6.42V17.6l-3.3-3.3-.29-.29H2v-4h3.41zm9.6 0 2.29 2.3-2.3 2.3 1.42 1.4L19 13.42l2.3 2.3 1.4-1.42-2.28-2.3 2.3-2.3-1.42-1.4-2.3 2.28-2.3-2.3z" clip-rule="evenodd"></path></svg>`;
              } else {
                // Icono con volumen
                volumePlaceholder.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M24 12a14 14 0 0 0-4.1-9.9l-1.415 1.415a12 12 0 0 1 0 16.97L19.9 21.9A14 14 0 0 0 24 12ZM11 4a1 1 0 0 0-1.707-.707L4.586 8H1a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3.586l4.707 4.707A1 1 0 0 0 11 20V4ZM5.707 9.707 9 6.414v11.172l-3.293-3.293L5.414 14H2v-4h3.414l.293-.293ZM16 12a6 6 0 0 0-1.757-4.243l-1.415 1.415a4 4 0 0 1 0 5.656l1.415 1.415A6 6 0 0 0 16 12Zm1.07-7.071a10 10 0 0 1 0 14.142l-1.413-1.414a8 8 0 0 0 0-11.314L17.07 4.93Z" fill="currentColor"></path></svg>`;
              }
              
              const svg = volumePlaceholder.querySelector('svg');
              if (svg) {
                svg.style.width = '36px';
                svg.style.height = '36px';
              }
            };

            // Actualizar icono cuando cambia el volumen o mute
            player.on('volumechange', updateVolumeIcon);
            
            // Asegurar que el reproductor no esté muteado después de autoplay
            player.one('playing', () => {
              if (player.muted()) {
                player.muted(false);
                playerLogger.log('🔊 [PLAYER] Unmuted después de autoplay');
              }
              updateVolumeIcon();
            });
            
            // Event listener para cambiar icono de play/pause dinámicamente
            player.on('play', () => {
              if (playPlaceholder) {
                playPlaceholder.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.5 3a.5.5 0 0 0-.5.5v17a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-17a.5.5 0 0 0-.5-.5h-5Zm10 0a.5.5 0 0 0-.5.5v17a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-17a.5.5 0 0 0-.5-.5h-5Z" fill="currentColor"></path></svg>`;
                const svg = playPlaceholder.querySelector('svg');
                if (svg) {
                  svg.style.width = '36px';
                  svg.style.height = '36px';
                }
              }
            });
            
            player.on('pause', () => {
              if (playPlaceholder) {
                playPlaceholder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" style="transform: translateX(5%);"><path fill="currentColor" d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"></path></svg>`;
                const svg = playPlaceholder.querySelector('svg');
                if (svg) {
                  svg.style.width = '36px';
                  svg.style.height = '36px';
                }
              }
            });
            
            // Event listener para cambiar icono de fullscreen dinámicamente
            player.on('fullscreenchange', () => {
              if (player.isFullscreen()) {
                if (fullscreenPlaceholder) {
                  fullscreenPlaceholder.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M24 8h-5V3h-2v7h7V8ZM0 16h5v5h2v-7H0v2Zm7-6H0V8h5V3h2v7Zm12 11v-5h5v-2h-7v7h2Z" fill="currentColor"></path></svg>`;
                  const svg = fullscreenPlaceholder.querySelector('svg');
                  if (svg) {
                    svg.style.width = '36px';
                    svg.style.height = '36px';
                  }
                }
              } else {
                if (fullscreenPlaceholder) {
                  fullscreenPlaceholder.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 5a2 2 0 0 1 2-2h7v2H2v4H0V5Zm22 0h-7V3h7a2 2 0 0 1 2 2v4h-2V5ZM2 15v4h7v2H2a2 2 0 0 1-2-2v-4h2Zm20 4v-4h2v4a2 2 0 0 1-2 2h-7v-2h7Z" fill="currentColor"></path></svg>`;
                  const svg = fullscreenPlaceholder.querySelector('svg');
                  if (svg) {
                    svg.style.width = '36px';
                    svg.style.height = '36px';
                  }
                }
              }
            });
            
            // Abrir modal directamente al hacer click en botón de subtítulos
            const subtitlesButton = playerEl.querySelector('.vjs-subtitles-button');
            if (subtitlesButton) {
              subtitlesButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openSubtitleSettings();
                playerLogger.log('🎛️ [SUBTITLES] Modal abierto desde botón');
              });
            }
            
            playerLogger.log('✅ [ICONS] Iconos reemplazados y tamaños aplicados');
          };
          
          setTimeout(initSubtitleSync, 200); // Dar tiempo al control bar
          setTimeout(replaceIcons, 400); // Reemplazar iconos y aplicar tamaños
        });

        // Inicializar plugins de skip
        player.ready(() => {
          try {
            // Inicializar los plugins de skip backward y forward
            if (typeof (player as any).skipBackward === 'function') {
              (player as any).skipBackward();
              playerLogger.log('✅ [PLAYER] Plugin skipBackward inicializado');
            }
            if (typeof (player as any).skipForward === 'function') {
              (player as any).skipForward();
              playerLogger.log('✅ [PLAYER] Plugin skipForward inicializado');
            }
          } catch (e) {
            playerLogger.warn('⚠️ [PLAYER] Error inicializando plugins de skip:', e);
          }
        });
        
        // Inicializar Chromecast después de crear el player
        if (chromecastLoaded) {
          // Contador de reintentos para evitar bucles infinitos
          let chromecastRetries = 0;
          const maxChromecastRetries = 10;
          
          // Esperar a que el Cast SDK esté disponible
          const initChromecast = () => {
            // Verificar límite de reintentos
            if (chromecastRetries >= maxChromecastRetries) {
              playerLogger.error('❌ [CHROMECAST] Máximo de reintentos alcanzado, deshabilitando Chromecast');
              return;
            }
            chromecastRetries++;
            
            // Verificar que el player esté disponible y listo
            if (!player || !player.el()) {
              playerLogger.warn(`⚠️ [CHROMECAST] Player no disponible, reintentando... (${chromecastRetries}/${maxChromecastRetries})`);
              setTimeout(initChromecast, 1000);
              return;
            }
            
            player.ready(() => {
              try {
                // Verificar que chrome.cast esté disponible y completamente inicializado
                if (!(window as any).cast?.framework) {
                  playerLogger.warn(`⚠️ [CHROMECAST] Cast SDK framework aún no disponible, reintentando... (${chromecastRetries}/${maxChromecastRetries})`);
                  setTimeout(initChromecast, 1500); // Delay reducido de 2000ms a 1500ms
                  return;
                }
                
                // Verificar que el CastContext esté disponible
                let castContext;
                try {
                  castContext = (window as any).cast.framework.CastContext.getInstance();
                  if (!castContext) {
                    playerLogger.warn(`⚠️ [CHROMECAST] CastContext no disponible, reintentando... (${chromecastRetries}/${maxChromecastRetries})`);
                    setTimeout(initChromecast, 1500);
                    return;
                  }
                } catch (contextError) {
                  playerLogger.warn(`⚠️ [CHROMECAST] Error obteniendo CastContext, reintentando... (${chromecastRetries}/${maxChromecastRetries})`, contextError);
                  setTimeout(initChromecast, 1500);
                  return;
                }
                
                // CRÍTICO: Verificar que el CastContext esté completamente inicializado
                // Esto previene el error "Cannot read properties of null (reading 'addUpdateListener')"
                
                // Simplificar la validación - solo verificar que el CastContext esté disponible
                // Las validaciones adicionales pueden estar causando problemas de inicialización
                playerLogger.log('✅ [CHROMECAST] CastContext disponible, inicializando plugin...');
                
                // Proceder con la inicialización del plugin sin validaciones adicionales
                // que pueden estar interfiriendo con el proceso de inicialización
                
                // Inicializar el plugin directamente sin validaciones adicionales
                // @ts-ignore - El plugin se registra dinámicamente
                if (typeof (player as any).chromecast === 'function') {
                  // @ts-ignore
                  player.chromecast({
                    receiverAppID: 'CC1AD845', // Default Media Receiver App ID
                    addButtonToControlBar: false, // No agregar al control bar, lo manejamos manualmente
                    preloadWebComponents: true,
                    requestTitleFn: function(source: any) {
                      return movieTitle || 'Video Stream';
                    },
                    requestSubtitleFn: function(source: any) {
                      return 'Streaming desde CineParaTodos';
                    },
                    requestCustomDataFn: function(source: any) {
                      const srcStr = String(source?.src || '');
                      const fallbackType = source?.type || (srcStr.toLowerCase().includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4');
                      return {
                        payload: {
                          title: movieTitle || 'Video Stream',
                          description: 'Streaming desde CineParaTodos',
                          poster: moviePoster || '',
                          src: source.src,
                          type: fallbackType
                        }
                      };
                    }
                  });
                  playerLogger.log('🎯 [CHROMECAST] Plugin inicializado con metadatos completos');
                  
                  // Agregar event listeners para debugging
                  player.on('chromecastConnected', () => {
                    playerLogger.log('✅ [CHROMECAST] Conectado exitosamente');
                  });
                  
                  player.on('chromecastDisconnected', () => {
                    playerLogger.log('🔌 [CHROMECAST] Desconectado');
                  });
                  
                  player.on('chromecastDevicesAvailable', (devices: any) => {
                    playerLogger.log('📱 [CHROMECAST] Dispositivos disponibles:', devices);
                  });
                  
                  player.on('chromecastError', (error: any) => {
                    logger.error('❌ [CHROMECAST] Error:', error);
                  });
                  
                } else {
                  playerLogger.warn('⚠️ [CHROMECAST] Método player.chromecast() no existe');
                }
              
              // Mover el botón fuera del control bar
              setTimeout(() => {
                const chromecastBtn = document.querySelector('.vjs-chromecast-button') as HTMLElement;
                const playerEl = player.el();
                
                if (chromecastBtn && playerEl) {
                  playerLogger.log('✅ [CHROMECAST] Botón encontrado, moviéndolo fuera del control bar');
                  
                  // Quitar clase vjs-hidden
                  chromecastBtn.classList.remove('vjs-hidden');
                  
                  // CRÍTICO: Sacar del control bar y agregar al contenedor principal
                  if (chromecastBtn.parentNode) {
                    chromecastBtn.parentNode.removeChild(chromecastBtn);
                  }
                  playerEl.appendChild(chromecastBtn);
                  
                  // Aplicar estilos
                  chromecastBtn.style.cssText = `
                    position: absolute !important;
                    top: 12px !important;
                    right: 12px !important;
                    z-index: 1000 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 44px !important;
                    height: 44px !important;
                    min-width: 44px !important;
                    border-radius: 50% !important;
                    background: rgba(0, 0, 0, 0.7) !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    cursor: pointer !important;
                    transition: all 0.3s ease !important;
                  `;
                  
                  // Agregar ícono SVG de Chromecast
                  chromecastBtn.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white" style="display: block; margin: auto;">
                      <path d="M1,18 v3 h3 c0,-1.66 -1.34,-3 -3,-3 z M1,14 v2 c2.76,0 5,2.24 5,5 h2 c0,-3.87 -3.13,-7 -7,-7 z M1,10 v2 c4.97,0 9,4.03 9,9 h2 c0,-6.08 -4.93,-11 -11,-11 z M21,3 L3,3 c-1.1,0 -2,0.9 -2,2 v3 h2 L3,5 h18 v14 h-7 v2 h7 c1.1,0 2,-0.9 2,-2 L23,5 c0,-1.1 -0.9,-2 -2,-2 z"/>
                    </svg>
                  `;
                  
                  // Event listener para hover
                  chromecastBtn.addEventListener('mouseenter', () => {
                    chromecastBtn.style.background = 'rgba(0, 0, 0, 0.9) !important';
                    chromecastBtn.style.transform = 'scale(1.1)';
                  });
                  
                  chromecastBtn.addEventListener('mouseleave', () => {
                    chromecastBtn.style.background = 'rgba(0, 0, 0, 0.7) !important';
                    chromecastBtn.style.transform = 'scale(1)';
                  });
                  
                  
                  playerLogger.log('✅ [CHROMECAST] Botón reposicionado con ícono visible y listener de debug');
                } else {
                  playerLogger.warn('❌ [CHROMECAST] Botón o Player element NO encontrado');
                }
              }, 1500);
              } catch (error) {
                logger.error('❌ [CHROMECAST] Error al inicializar:', error);
              }
            });
          };
          
          // Esperar a que el Cast SDK esté disponible
          playerLogger.log('⏳ [CHROMECAST] Configurando inicialización del Cast SDK...');
          
          // Google Cast SDK dispara este evento cuando está listo
          (window as any).__onGCastApiAvailable = (isAvailable: boolean) => {
            if (isAvailable) {
              playerLogger.log('✅ [CHROMECAST] Cast SDK cargado exitosamente via callback');
              // Delay reducido para mejorar rendimiento
              setTimeout(initChromecast, 200);
            } else {
              playerLogger.warn('⚠️ [CHROMECAST] Cast SDK no disponible via callback');
            }
          };
          
          // También verificar si ya está disponible (por si el callback ya se ejecutó)
          if ((window as any).cast?.framework) {
            playerLogger.log('✅ [CHROMECAST] Cast SDK framework ya disponible');
            setTimeout(initChromecast, 200);
          } else if ((window as any).chrome?.cast) {
            playerLogger.log('✅ [CHROMECAST] Cast SDK básico disponible, esperando framework...');
            setTimeout(initChromecast, 500);
          } else {
            playerLogger.log('⏳ [CHROMECAST] Esperando Cast SDK completo...');
          }
        } else {
          playerLogger.warn('⚠️ [CHROMECAST] Plugin NO cargado');
        }

            // Configurar cuando el player esté listo
            player.ready(() => {
              playerLogger.log('🎬 [PLAYER] Ready');
              
              // Aplicar tema
              player.addClass('vjs-theme-forest');
              
              // Aplicar tema también al elemento DOM
              if (player.el()) {
                player.el().classList.add('vjs-theme-forest');
              }
              
              // Aplicar estilos por defecto para subtítulos (posición arriba de controles)
              let defaultSubtitleStyle = document.getElementById('vjs-custom-subtitle-style');
              if (!defaultSubtitleStyle) {
                defaultSubtitleStyle = document.createElement('style');
                defaultSubtitleStyle.id = 'vjs-custom-subtitle-style';
                document.head.appendChild(defaultSubtitleStyle);
                
                defaultSubtitleStyle.textContent = `
                  .vjs-text-track-display {
                    bottom: 5% !important;
                  }
                `;
                
                playerLogger.log('✅ [PLAYER] Estilos por defecto de subtítulos aplicados');
              }
              
              // Inicializar plugin de carga de subtítulos
              try {
                (player as any).subtitleUpload({
                  onFileSelected: async (file: File) => {
                    playerLogger.log(`📁 [SUBTITLES] Archivo seleccionado: ${file.name}`);
                    
                    try {
                      // Leer el contenido del archivo con detección de encoding
                      const arrayBuffer = await file.arrayBuffer();
                      
                      // Intentar decodificar con diferentes encodings
                      let text = '';
                      const encodings = ['UTF-8', 'ISO-8859-1', 'Windows-1252'];
                      
                      for (const encoding of encodings) {
                        try {
                          const decoder = new TextDecoder(encoding);
                          text = decoder.decode(arrayBuffer);
                          
                          // Verificar si el texto tiene caracteres válidos
                          // Si tiene muchos caracteres de reemplazo (�), probar siguiente encoding
                          const replacementChars = (text.match(/�/g) || []).length;
                          if (replacementChars < text.length * 0.01) { // Menos del 1% de caracteres raros
                            playerLogger.log(`✅ [SUBTITLES] Encoding detectado: ${encoding}`);
                            break;
                          }
                        } catch (e) {
                          playerLogger.warn(`⚠️ [SUBTITLES] Error con encoding ${encoding}:`, e);
                          continue;
                        }
                      }
                      
                      // Detectar formato y convertir a VTT si es necesario
                      let processedContent = text;
                      const isVTT = text.startsWith('WEBVTT');
                      
                      if (!isVTT) {
                        // Convertir SRT a VTT
                        const isSRT = /^\d+\s*\r?\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/m.test(text);
                        
                        if (isSRT) {
                          playerLogger.log('🔄 [SUBTITLES] Convirtiendo SRT a VTT...');
                          // Reemplazar comas por puntos en timestamps
                          processedContent = 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
                        } else {
                          processedContent = 'WEBVTT\n\n' + text;
                        }
                      }
                      
                      // Crear blob con el contenido procesado con UTF-8 explícito
                      const blob = new Blob([processedContent], { type: 'text/vtt; charset=utf-8' });
                      const fileURL = URL.createObjectURL(blob);
                      
                      // Agregar el subtítulo al player
                      player.addRemoteTextTrack({
                        kind: 'subtitles',
                        src: fileURL,
                        srclang: 'es',
                        label: `${file.name} (Cargado)`,
                        default: false
                      }, false);
                      
                      playerLogger.log(`✅ [SUBTITLES] Subtítulo agregado: ${file.name}`);
                      
                      // Reinicializar el botón de configuración después de agregar subtítulo
                      // Esperar más tiempo para que Video.js actualice su menú
                      setTimeout(() => {
                        playerLogger.log('🔄 [SUBTITLES] Intentando reinicializar botón de configuración...');
                        
                        // Acceder al plugin LLAMANDO a la función (Video.js pattern)
                        const pluginFunc = (player as any).subtitleSync;
                        
                        if (typeof pluginFunc === 'function') {
                          // Llamar la función para obtener la instancia
                          const pluginInstance = pluginFunc();
                          
                          playerLogger.log('🔍 [DEBUG] Plugin instance obtenida:', pluginInstance);
                          playerLogger.log('🔍 [DEBUG] Método addSettingsButton existe:', typeof pluginInstance?.addSettingsButton);
                          
                          if (pluginInstance && typeof pluginInstance.addSettingsButton === 'function') {
                            playerLogger.log('✅ [SUBTITLES] Plugin encontrado, reinicializando botón...');
                            pluginInstance.addSettingsButton();
                          } else {
                            playerLogger.warn('⚠️ [SUBTITLES] Método addSettingsButton no disponible');
                          }
                        } else {
                          playerLogger.warn('⚠️ [SUBTITLES] Plugin subtitleSync no es una función');
                        }

                        // NUEVO: Reaplicar fix de hover después de cargar subtítulos locales
                        setTimeout(() => {
                          const playerEl = player.el();
                          if (!playerEl) return;
                          
                          const subsButton = playerEl.querySelector('.vjs-subs-caps-button, .vjs-subtitles-button, .vjs-captions-button');
                          if (!subsButton) return;

                          const menu = subsButton.querySelector('.vjs-menu');
                          if (!menu) return;

                          // Limpiar listeners previos si existen
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
                            }, 200);
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
                            }, 200);
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

                          playerLogger.log('✅ [SUBTITLES] Fix de hover reaplicado después de cargar subtítulo local');
                        }, 300);
                      }, 1500); // Aumentado a 1.5s para dar tiempo a Video.js
                      
                    } catch (error) {
                      logger.error('❌ [SUBTITLES] Error procesando archivo:', error);
                    }
                  }
                });
                playerLogger.log('📁 [PLUGIN] Plugin de subtítulos inicializado');
              } catch (pluginError) {
                playerLogger.warn('⚠️ [PLUGIN] Error inicializando plugin de subtítulos:', pluginError);
              }
              
              // Configurar source con metadatos para Chromecast
              // Detectar tipo de video basado en la URL
              const getVideoType = (url: string): string | undefined => {
                if (!url) return 'video/mp4'; // Default a MP4
                const urlLower = url.toLowerCase();
                if (urlLower.includes('.m3u8')) {
                  return 'application/x-mpegURL';
                }
                if (urlLower.includes('.mkv')) {
                  // ✅ Para MKV, forzar video/mp4 para que el navegador intente reproducirlo
                  // El navegador puede reproducir H.264 dentro de MKV si el servidor lo sirve correctamente
                  return 'video/mp4';
                }
                if (urlLower.includes('.webm')) {
                  return 'video/webm';
                }
                if (urlLower.includes('.avi')) {
                  return 'video/mp4'; // Forzar MP4 también para AVI
                }
                // Por compatibilidad con Chromecast y navegadores
                return 'video/mp4';
              };
              
              const videoType = getVideoType(streamUrl);
              const isMkvFile = streamUrl?.toLowerCase().includes('.mkv') || false;
              
              const sourceConfig: any = {
                src: (() => {
                  // Si usamos el nuevo proxy local, no envolver ni reescribir
                  if (videoType === 'application/x-mpegURL' && IS_BROWSER_PROXY) {
                    return streamUrl as string;
                  }
                  // Envolver solo si es HLS externo absoluto y está habilitado el viejo proxy
                  if (USE_HLS_PROXY && videoType === 'application/x-mpegURL' && typeof BASE_STREAM_URL === 'string' && /^https?:\/\//i.test(BASE_STREAM_URL)) {
                    let origin = '';
                    try { origin = new URL(BASE_STREAM_URL!).origin + '/'; } catch {}
                    const absoluteUrl = BASE_STREAM_URL!;
                    const ref = origin || (new URL(absoluteUrl).origin + '/');
                    return `/api/cors-proxy?url=${encodeURIComponent(absoluteUrl)}&ref=${encodeURIComponent(ref)}&forceRef=1`;
                  }
                  return streamUrl as string;
                })(),
                // Metadatos adicionales para Chromecast
                poster: moviePoster || '',
                title: movieTitle || 'Video Stream',
                description: 'Streaming desde CineParaTodos'
              };
              
              // ✅ Solo agregar 'type' si se detectó uno válido
              // Para MKV/AVI, omitir 'type' y dejar que Video.js use el Content-Type del servidor
              if (IS_BROWSER_PROXY) {
                sourceConfig.type = 'application/x-mpegURL';
              } else if (videoType) {
                sourceConfig.type = videoType;
              }
              
              // Advertir sobre archivos MKV
              if (isMkvFile) {
                playerLogger.warn('⚠️ [CHROMECAST] Archivo MKV detectado - usando tipo MP4 para compatibilidad');
                playerLogger.warn('⚠️ [CHROMECAST] El servidor debe transcodificar MKV a MP4 para Chromecast');
              }
              
              playerLogger.log('🎯 [CHROMECAST] Configurando source con metadatos:', sourceConfig);
              playerLogger.log('🎯 [CHROMECAST] Stream URL completa:', streamUrl);
              
              // Verificar si Chromecast está disponible
              if ((player as any).chromecast) {
                playerLogger.log('✅ [CHROMECAST] Plugin disponible');
                
                // Agregar listeners para eventos de Chromecast
                player.on('chromecastConnected', () => {
                  playerLogger.log('🔗 [CHROMECAST] Conectado exitosamente');
                });
                
                player.on('chromecastDisconnected', () => {
                  playerLogger.log('🔌 [CHROMECAST] Desconectado');
                });
                
                player.on('chromecastDevicesAvailable', (devices: any) => {
                  playerLogger.log('📱 [CHROMECAST] Dispositivos disponibles:', devices);
                });
                
                player.on('loadstart', () => {
                  const chromecast = (player as any).chromecast;
                  if (chromecast && typeof chromecast.isConnected === 'function' && chromecast.isConnected()) {
                    playerLogger.log('🎬 [CHROMECAST] Iniciando carga de video en dispositivo');
                  }
                });
                
                player.on('loadedmetadata', () => {
                  const chromecast = (player as any).chromecast;
                  if (chromecast && typeof chromecast.isConnected === 'function' && chromecast.isConnected()) {
                    playerLogger.log('📊 [CHROMECAST] Metadatos cargados en dispositivo');
                  }
                });
                
                player.on('canplay', () => {
                  const chromecast = (player as any).chromecast;
                  if (chromecast && typeof chromecast.isConnected === 'function' && chromecast.isConnected()) {
                    playerLogger.log('▶️ [CHROMECAST] Video listo para reproducir en dispositivo');
                  }
                });
                
                player.on('error', (error: any) => {
                  const chromecast = (player as any).chromecast;
                  if (chromecast && typeof chromecast.isConnected === 'function' && chromecast.isConnected()) {
                    playerLogger.error('❌ [CHROMECAST] Error en dispositivo:', error);
                  }
                });
                
              } else {
                playerLogger.warn('⚠️ [CHROMECAST] Plugin no disponible');
              }
              
              player.src(sourceConfig);
              try {
                const fix = () => {
                  try {
                    const el = player.el() as HTMLElement | null;
                    if (el) { (el as HTMLElement).style.visibility = 'visible'; (el as HTMLElement).style.opacity = '1'; (el as HTMLElement).style.display = 'block'; }
                    const v = el ? (el.querySelector('video') as HTMLVideoElement | null) : null;
                    if (v) { v.style.visibility = 'visible'; v.style.opacity = '1'; v.style.display = 'block'; v.style.width = '100%'; v.style.height = '100%'; }
                    const tech = el ? (el.querySelector('.vjs-tech') as HTMLElement | null) : null;
                    if (tech) { tech.style.visibility = 'visible'; tech.style.opacity = '1'; tech.style.display = 'block'; }
                  } catch {}
                };
                setTimeout(fix, 300);
                player.on('loadedmetadata', fix);
                player.on('playing', fix);
                player.on('resize', fix);
              } catch {}

              // Bloquear la calidad más alta y evitar cambios de ABR
              try {
                const ql = (player as any).qualityLevels ? (player as any).qualityLevels() : null;
                const lockHighest = () => {
                  if (!ql) return;
                  const list: any = ql;
                  const len: number = Number(list?.length ?? 0);
                  if (!len) return;
                  let maxIdx = 0;
                  let maxBitrate = 0;
                  for (let i = 0; i < len; i++) {
                    const level = list.item ? list.item(i) : list[i];
                    const br = (level?.bitrate ?? 0) as number;
                    if (br >= maxBitrate) {
                      maxBitrate = br;
                      maxIdx = i;
                    }
                  }
                  for (let i = 0; i < len; i++) {
                    const level = list.item ? list.item(i) : list[i];
                    if (level) level.enabled = i === maxIdx;
                  }
                  playerLogger.log(`🔒 [QUALITY] Fijada calidad más alta (bitrate=${maxBitrate})`);
                };
                if (ql) {
                  ql.on && ql.on('addqualitylevel', lockHighest);
                  player.on('loadedmetadata', lockHighest);
                }
              } catch (e) {
                playerLogger.warn('⚠️ [QUALITY] No se pudo bloquear calidad más alta:', e);
              }

              // Intento de recuperación suave ante errores HLS (CODE:4)
              let hlsErrorRetries = 0;
              player.on('error', () => {
                const err = player.error();
                if (err && err.code === 4 && typeof streamUrl === 'string' && streamUrl.includes('.m3u8') && hlsErrorRetries < 1) {
                  hlsErrorRetries += 1;
                  const ct = player.currentTime();
                  playerLogger.warn('♻️ [RECOVERY] Reintentando recargar fuente HLS tras CODE:4');
                  try {
                    player.reset();
                    const reloadSrc = (USE_HLS_PROXY && typeof streamUrl === 'string')
                      ? (() => {
                          const origin = new URL(streamUrl!).origin + '/';
                          return `/api/cors-proxy?url=${encodeURIComponent(streamUrl!)}&ref=${encodeURIComponent(origin)}`;
                        })()
                      : streamUrl;
                    player.src({ src: reloadSrc as string, type: 'application/x-mpegURL' });
                    player.one('loadedmetadata', () => {
                      if (typeof ct === 'number') {
                        try { player.currentTime(ct); } catch {}
                      }
                      if (player && typeof (player as any).play === 'function') {
                        (player as any).play().catch(() => {});
                      }
                    });
                  } catch (e) {
                    playerLogger.error('❌ [RECOVERY] Falló el reintento de recarga:', e);
                  }
                }
              });

              // Aplicar estilos adicionales después de un delay
              setTimeout(() => {
                playerLogger.log('🎨 [STYLES] Aplicando estilos personalizados...');
                const controlBar = (player as any).controlBar;
                const playerEl = player.el();
                playerLogger.log('🎨 [STYLES] controlBar:', controlBar ? 'encontrado' : 'NULL');

                // Forzar que el volume panel siempre tenga la clase hover (layout correcto)
                setTimeout(() => {
                  if (playerEl) {
                    const volumePanel = playerEl.querySelector('.vjs-volume-panel');
                    if (volumePanel) {
                      // Agregar clase hover permanentemente
                      volumePanel.classList.add('vjs-hover');
                      volumePanel.classList.add('vjs-slider-active');
                      
                      playerLogger.log('✅ [PLAYER] Volume panel con hover permanente');
                    }
                  }
                }, 1000);
            
            // Agregar atajos de teclado
            const handleKeyboard = (e: KeyboardEvent) => {
              // Ignorar si hay un input/textarea enfocado
              const activeElement = document.activeElement;
              if (
                activeElement?.tagName === 'INPUT' ||
                activeElement?.tagName === 'TEXTAREA' ||
                activeElement?.getAttribute('contenteditable') === 'true'
              ) {
                return;
              }

              const currentTime = player.currentTime() || 0;
              const duration = player.duration() || 0;

              switch (e.code) {
                case 'Space':
                  e.preventDefault();
                  if (player.paused()) {
                    player.play();
                    playerLogger.log('⏯️ [KEYBOARD] Play (Space)');
                  } else {
                    player.pause();
                    playerLogger.log('⏯️ [KEYBOARD] Pause (Space)');
                  }
                  break;

                case 'ArrowRight':
                  e.preventDefault();
                  player.currentTime(Math.min(currentTime + 5, duration || currentTime + 5));
                  playerLogger.log('⏩ [KEYBOARD] +5s (Arrow Right)');
                  break;

                case 'ArrowLeft':
                  e.preventDefault();
                  player.currentTime(Math.max(currentTime - 5, 0));
                  playerLogger.log('⏪ [KEYBOARD] -5s (Arrow Left)');
                  break;

                case 'ArrowUp':
                  e.preventDefault();
                  const currentVolume = player.volume() || 0;
                  const newVolumeUp = Math.min(currentVolume + 0.1, 1);
                  player.volume(newVolumeUp);
                  playerLogger.log(`🔊 [KEYBOARD] Volume: ${Math.round(newVolumeUp * 100)}% (Arrow Up)`);
                  break;

                case 'ArrowDown':
                  e.preventDefault();
                  const currentVolumeDown = player.volume() || 0;
                  const newVolumeDown = Math.max(currentVolumeDown - 0.1, 0);
                  player.volume(newVolumeDown);
                  playerLogger.log(`🔉 [KEYBOARD] Volume: ${Math.round(newVolumeDown * 100)}% (Arrow Down)`);
                  break;

                case 'KeyF':
                  e.preventDefault();
                  if (player.isFullscreen()) {
                    player.exitFullscreen();
                    playerLogger.log('🖥️ [KEYBOARD] Exit Fullscreen (F)');
                  } else {
                    player.requestFullscreen();
                    playerLogger.log('🖥️ [KEYBOARD] Enter Fullscreen (F)');
                  }
                  break;

                case 'KeyM':
                  e.preventDefault();
                  player.muted(!player.muted());
                  playerLogger.log(`🔇 [KEYBOARD] Mute: ${player.muted()} (M)`);
                  break;

                case 'KeyK':
                  e.preventDefault();
                  if (player.paused()) {
                    player.play();
                    playerLogger.log('⏯️ [KEYBOARD] Play (K)');
                  } else {
                    player.pause();
                    playerLogger.log('⏯️ [KEYBOARD] Pause (K)');
                  }
                  break;

                case 'KeyJ':
                  e.preventDefault();
                  player.currentTime(Math.max(currentTime - 10, 0));
                  playerLogger.log('⏪ [KEYBOARD] -10s (J)');
                  break;

                case 'KeyL':
                  e.preventDefault();
                  player.currentTime(Math.min(currentTime + 10, duration || currentTime + 10));
                  playerLogger.log('⏩ [KEYBOARD] +10s (L)');
                  break;

                default:
                  break;
              }
            };

            document.addEventListener('keydown', handleKeyboard);
            playerLogger.log('⌨️ [PLAYER] Atajos de teclado habilitados');

            // Cleanup de keyboard listener
            const currentPlayer = playerRef.current;
            if (currentPlayer && typeof currentPlayer.on === 'function') {
              currentPlayer.on('dispose', () => {
                document.removeEventListener('keydown', handleKeyboard);
                playerLogger.log('⌨️ [PLAYER] Atajos de teclado removidos');
              });
            }
            
            // Estilizar video element
                if (playerEl) {
                  const videoElement = playerEl.querySelector('video');
                  if (videoElement) {
                    (videoElement as HTMLElement).style.cssText += `
                      width: 100% !important;
                      height: 100% !important;
                      object-fit: contain !important;
                      background: transparent !important;
                    `;
                  }
                }

                // Estilizar control bar
                if (controlBar) {
                  const controlBarEl = controlBar.el();
                  if (controlBarEl) {
                    controlBarEl.style.cssText += `
                      background: rgba(0,0,0,0.7);
                      padding: 8px 16px;
                      height: 60px;
                      align-items: center;
                    `;

                    // Estilizar botones
                    const buttons = controlBarEl.querySelectorAll('.vjs-button');
                    buttons.forEach((button: Element) => {
                      (button as HTMLElement).style.cssText += `
                        margin: 0 4px !important;
                        padding: 8px !important;
                        border-radius: 4px !important;
                        transition: background-color 0.2s ease !important;
                      `;
                      
                      button.addEventListener('mouseenter', () => {
                        (button as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.1)';
                      });
                      
                      button.addEventListener('mouseleave', () => {
                        (button as HTMLElement).style.backgroundColor = 'transparent';
                      });
                    });

                    // Estilizar progress control
                    playerLogger.log('📏 [PROGRESS] Intentando estilizar progress control...');
                    const progressControl = controlBar.progressControl;
                    playerLogger.log('📏 [PROGRESS] progressControl:', progressControl ? 'encontrado' : 'NULL');
                    if (progressControl) {
                      const progressEl = progressControl.el();
                      playerLogger.log('📏 [PROGRESS] progressEl:', progressEl ? 'encontrado' : 'NULL');
                      if (progressEl) {
                        playerLogger.log('📏 [PROGRESS] Aplicando margin-left: 0px');
                        // Usar asignación directa para cada propiedad
                        (progressEl as HTMLElement).style.marginLeft = '0px';
                        (progressEl as HTMLElement).style.marginRight = '16px';
                        playerLogger.log('📏 [PROGRESS] Margin aplicado correctamente');
                      }
                    }
                  }
                }

                // Agregar botón de episodios si está habilitado (ANTES del control bar setup)
                if (showEpisodeButton && onEpisodeButtonClick && controlBar) {
                  const controlBarEl = controlBar.el();
                  if (controlBarEl) {
                    // Verificar si el botón ya existe
                    let episodeButton = controlBarEl.querySelector('.vjs-episode-selector-button') as HTMLButtonElement;
                    if (!episodeButton) {
                    // Crear botón de episodios
                      episodeButton = document.createElement('button');
                    episodeButton.className = 'vjs-button vjs-episode-selector-button';
                    episodeButton.type = 'button';
                    episodeButton.title = 'Seleccionar episodio';
                    episodeButton.innerHTML = `
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" style="width: 36px; height: 36px;"><path fill="currentColor" fill-rule="evenodd" d="M8 5h14v8h2V5a2 2 0 0 0-2-2H8zm10 4H4V7h14a2 2 0 0 1 2 2v8h-2zM0 13c0-1.1.9-2 2-2h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm14 6v-6H2v6z" clip-rule="evenodd"></path></svg>
                    `;
                    
                    // Estilizar botón
                    episodeButton.style.cssText += `
                      margin: 0 4px !important;
                      padding: 8px !important;
                      border-radius: 4px !important;
                      transition: background-color 0.2s ease !important;
                      background: transparent !important;
                      border: none !important;
                      color: white !important;
                      cursor: pointer !important;
                    `;
                    
                    // Event listeners para hover
                    episodeButton.addEventListener('mouseenter', () => {
                        episodeButton!.style.backgroundColor = 'rgba(255,255,255,0.1)';
                    });
                    
                    episodeButton.addEventListener('mouseleave', () => {
                        episodeButton!.style.backgroundColor = 'transparent';
                    });
                    
                    // Event listener para click
                    episodeButton.addEventListener('click', () => {
                      onEpisodeButtonClick();
                    });
                    
                      // Agregar temporalmente al control bar (se reorganizará después)
                    const fullscreenButton = controlBarEl.querySelector('.vjs-fullscreen-control');
                    if (fullscreenButton) {
                      controlBarEl.insertBefore(episodeButton, fullscreenButton);
                    } else {
                      controlBarEl.appendChild(episodeButton);
                      }
                      playerLogger.log('✅ [PLAYER] Botón de episodios creado');
                    }
                  }
                }

                // Agregar botón de próximo episodio si está habilitado (ANTES del control bar setup)
                playerLogger.log('🔍 [NEXT-EPISODE] showNextEpisodeButton:', showNextEpisodeButton, 'onNextEpisodeClick:', !!onNextEpisodeClick, 'controlBar:', !!controlBar);
                if (showNextEpisodeButton && onNextEpisodeClick && controlBar) {
                  playerLogger.log('✅ [NEXT-EPISODE] Creando botón de próximo episodio');
                  const controlBarEl = controlBar.el();
                  if (controlBarEl) {
                    // Verificar si el botón ya existe
                    let nextEpisodeButton = controlBarEl.querySelector('.vjs-next-episode-button') as HTMLButtonElement;
                    if (!nextEpisodeButton) {
                      // Crear botón de próximo episodio
                      nextEpisodeButton = document.createElement('button');
                      nextEpisodeButton.className = 'vjs-button vjs-next-episode-button';
                      nextEpisodeButton.type = 'button';
                      nextEpisodeButton.title = 'Próximo episodio';
                      nextEpisodeButton.innerHTML = `
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M22 3H20V21H22V3ZM4.28615 3.61729C3.28674 3.00228 2 3.7213 2 4.89478V19.1052C2 20.2787 3.28674 20.9977 4.28615 20.3827L15.8321 13.2775C16.7839 12.6918 16.7839 11.3082 15.8321 10.7225L4.28615 3.61729ZM4 18.2104V5.78956L14.092 12L4 18.2104Z" fill="currentColor"></path></svg>
                      `;
                      
                      // Estilizar botón
                      nextEpisodeButton.style.cssText += `
                        margin: 0 4px !important;
                        padding: 8px !important;
                        border-radius: 4px !important;
                        transition: background-color 0.2s ease !important;
                        background: transparent !important;
                        border: none !important;
                        color: white !important;
                        cursor: pointer !important;
                      `;
                      
                      // Event listeners para hover
                      nextEpisodeButton.addEventListener('mouseenter', () => {
                        nextEpisodeButton!.style.backgroundColor = 'rgba(255,255,255,0.1)';
                      });
                      
                      nextEpisodeButton.addEventListener('mouseleave', () => {
                        nextEpisodeButton!.style.backgroundColor = 'transparent';
                      });
                      
                      // Event listener para click
                      nextEpisodeButton.addEventListener('click', () => {
                        onNextEpisodeClick();
                      });
                      
                      // Agregar temporalmente al control bar (se reorganizará después)
                      const fullscreenButton = controlBarEl.querySelector('.vjs-fullscreen-control');
                      if (fullscreenButton) {
                        controlBarEl.insertBefore(nextEpisodeButton, fullscreenButton);
                      } else {
                        controlBarEl.appendChild(nextEpisodeButton);
                      }
                      playerLogger.log('✅ [PLAYER] Botón de próximo episodio creado');
                    }
                  }
                }

                // Crear botón de audio (si hay custom stream disponible)
                if (customStreamUrl) {
                  const controlBar = player.getChild('ControlBar');
                  if (controlBar) {
                    const controlBarEl = controlBar.el();
                    if (controlBarEl && !controlBarEl.querySelector('.vjs-audio-selector-button')) {
                      playerLogger.log('🎧 [AUDIO-BUTTON] Creando botón de audio...');
                      
                      const audioButton = document.createElement('button');
                      audioButton.className = 'vjs-audio-selector-button vjs-control vjs-button';
                      audioButton.type = 'button';
                      audioButton.title = 'Seleccionar audio';
                      audioButton.setAttribute('aria-label', 'Seleccionar audio');
                      
                      // SVG de auriculares
                      audioButton.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 1.5em; height: 1.5em; display: block; margin: auto;"><g stroke-width="0"/><g stroke-linecap="round" stroke-linejoin="round"/><g fill="currentColor"><path d="M2 12.124C2 6.533 6.477 2 12 2s10 4.533 10 10.124v5.243c0 .817 0 1.378-.143 1.87a3.52 3.52 0 0 1-1.847 2.188c-.458.22-1.004.307-1.801.434l-.13.02a13 13 0 0 1-.727.105c-.209.02-.422.027-.64-.016a2.1 2.1 0 0 1-1.561-1.35 2.2 2.2 0 0 1-.116-.639c-.012-.204-.012-.452-.012-.742v-4.173c0-.425 0-.791.097-1.105a2.1 2.1 0 0 1 1.528-1.43c.316-.073.677-.044 1.096-.01l.093.007.11.01c.783.062 1.32.104 1.775.275q.481.181.883.487v-1.174c0-4.811-3.853-8.711-8.605-8.711s-8.605 3.9-8.605 8.711v1.174c.267-.203.563-.368.883-.487.455-.17.992-.213 1.775-.276l.11-.009.093-.007c.42-.034.78-.063 1.096.01a2.1 2.1 0 0 1 1.528 1.43c.098.314.097.68.097 1.105v4.172c0 .291 0 .54-.012.743-.012.213-.04.427-.116.638a2.1 2.1 0 0 1-1.56 1.35 2.2 2.2 0 0 1-.641.017c-.201-.02-.444-.059-.727-.104l-.13-.02c-.797-.128-1.344-.215-1.801-.436a3.52 3.52 0 0 1-1.847-2.188c-.118-.405-.139-.857-.142-1.461L2 17.58z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M12 5.75a.75.75 0 0 1 .75.75v5a.75.75 0 1 1-1.5 0v-5a.75.75 0 0 1 .75-.75m3 1.5a.75.75 0 0 1 .75.75v2a.75.75 0 1 1-1.5 0V8a.75.75 0 0 1 .75-.75m-6 0a.75.75 0 0 1 .75.75v2a.75.75 0 0 1-1.5 0V8A.75.75 0 0 1 9 7.25"/></g></svg>
                      `;

                      // Event listener
                      audioButton.addEventListener('click', () => {
                        playerLogger.log('🎧 [AUDIO-BUTTON] Click detectado');
                        if (onToggleAudioMenu) {
                          onToggleAudioMenu();
                        }
                      });

                      // Insertar antes del botón de fullscreen
                      const fullscreenButton = controlBarEl.querySelector('.vjs-fullscreen-control');
                      if (fullscreenButton) {
                        controlBarEl.insertBefore(audioButton, fullscreenButton);
                        playerLogger.log('✅ [AUDIO-BUTTON] Botón de audio insertado antes de Fullscreen');
                      } else {
                        controlBarEl.appendChild(audioButton);
                        playerLogger.log('⚠️ [AUDIO-BUTTON] Fullscreen no encontrado, agregado al final');
                      }
                    }
                  }
                }

              }, 300); // Ejecutar antes que setupPixelPerfectCenter

              // Crear contenedor de overlays dentro del DOM de Video.js
              setTimeout(() => {
                const playerEl = player.el();
                if (!playerEl) return;

                // Crear contenedor principal para overlays
                let overlayContainer = playerEl.querySelector('.vjs-overlay-container');
                if (!overlayContainer) {
                  overlayContainer = document.createElement('div');
                  overlayContainer.className = 'vjs-overlay-container';
                  (overlayContainer as HTMLElement).style.cssText = `
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 2100;
                    pointer-events: none;
                  `;
                  playerEl.appendChild(overlayContainer);
                }

                // Crear botón Volver (arriba a la izquierda)
                let backButton = playerEl.querySelector('.vjs-back-button-overlay') as HTMLButtonElement;
                if (!backButton) {
                  backButton = document.createElement('button') as HTMLButtonElement;
                  backButton.className = 'vjs-back-button-overlay';
                  backButton.type = 'button';
                  backButton.title = 'Volver';
                  backButton.innerHTML = `
                    <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg" fill="none">
                      <path fill="currentColor" fill-rule="evenodd" d="M6.41 11H21v2H6.41l5.3 5.3-1.42 1.4-7-7a1 1 0 0 1 0-1.4l7-7 1.42 1.4z" clip-rule="evenodd"></path>
                    </svg>
                  `;
                  backButton.style.cssText = `
                    position: absolute;
                    top: 20px;
                    left: 20px;
                    background: rgba(0, 0, 0, 0.6);
                    color: white;
                    border: none;
                    border-radius: 50%;
                    padding: 12px;
                    width: 48px;
                    height: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    z-index: 2150;
                    pointer-events: auto;
                    backdrop-filter: blur(4px);
                    transition: background-color 0.2s ease;
                    font-size: 14px;
                  `;
                  backButton.addEventListener('mouseenter', () => {
                    backButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                  });
                  backButton.addEventListener('mouseleave', () => {
                    backButton.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                  });
                  backButton.addEventListener('click', () => {
                    try {
                      if (onClose) {
                        onClose();
                      } else {
                        window.history.back();
                      }
                    } catch (e) {
                      playerLogger.warn('⚠️ [BACK] Error al cerrar:', e);
                    }
                  });
                  playerEl.appendChild(backButton);
                  playerLogger.log('✅ [BACK] Botón Volver creado en overlay');
                }

                // Sincronizar visibilidad del botón Volver con los controles
                const syncBackButtonVisibility = () => {
                  const backBtn = playerEl.querySelector('.vjs-back-button-overlay') as HTMLElement;
                  if (!backBtn) return;

                  // Verificar si el player está "useractive" (controles visibles) o pausado
                  const isActive = player.hasClass('vjs-user-active') || player.hasClass('vjs-paused');
                  backBtn.style.opacity = isActive ? '1' : '0';
                  backBtn.style.pointerEvents = isActive ? 'auto' : 'none';
                  backBtn.style.transition = 'opacity 0.3s ease';
                };

                // Escuchar eventos de actividad del usuario
                player.on('useractive', syncBackButtonVisibility);
                player.on('userinactive', syncBackButtonVisibility);
                player.on('pause', syncBackButtonVisibility);
                player.on('play', syncBackButtonVisibility);
                
                // Sincronizar inicialmente
                setTimeout(syncBackButtonVisibility, 100);

                // ========== OVERLAY DE PAUSA (aparece después de 5 segundos) ==========
                let pauseOverlayTimeout: ReturnType<typeof setTimeout> | null = null;
                let pauseOverlay: HTMLElement | null = null;

                const createPauseOverlay = () => {
                  if (pauseOverlay) return pauseOverlay;

                  // Debug: Log de datos recibidos
                  playerLogger.log('📺 [PAUSE-OVERLAY] Creando overlay con datos:', {
                    logoPath,
                    year,
                    rating,
                    overview: overview ? `${overview.substring(0, 50)}...` : 'sin overview',
                    season,
                    episode,
                    movieTitle,
                    videoDuration
                  });

                  pauseOverlay = document.createElement('div');
                  pauseOverlay.className = 'vjs-pause-info-overlay';
                  
                  // Construir contenido del overlay
                  const isSeriesContent = !!season && !!episode;
                  const showLogo = logoPath && logoPath.trim() !== '';
                  
                  let metadataHtml = '';
                  if (isSeriesContent) {
                    const episodeTitleText = episodeTitle ? ` • ${episodeTitle}` : '';
                    metadataHtml = `<div class="pause-overlay-metadata">T${season} • E${episode}${episodeTitleText}</div>`;
                  } else if (year || videoDuration || rating) {
                    const parts = [];
                    if (year) parts.push(year);
                    if (videoDuration) {
                      const hours = Math.floor(videoDuration / 3600);
                      const minutes = Math.floor((videoDuration % 3600) / 60);
                      if (hours > 0) {
                        parts.push(`${hours}h ${minutes}min`);
                      } else {
                        parts.push(`${minutes}min`);
                      }
                    }
                    if (rating) parts.push(`⭐ ${rating.toFixed(1)}`);
                    metadataHtml = `<div class="pause-overlay-metadata">${parts.join(' • ')}</div>`;
                  }

                  const synopsisHtml = overview ? `<p class="pause-overlay-synopsis">${overview}</p>` : '';
                  
                  playerLogger.log('📺 [PAUSE-OVERLAY] HTML generado:', {
                    metadataHtml,
                    synopsisHtml: synopsisHtml ? 'presente' : 'vacío',
                    showLogo
                  });

                  pauseOverlay.innerHTML = `
                    <div class="pause-overlay-content">
                      <div class="pause-overlay-label">Estás viendo</div>
                      ${showLogo ? `<img src="${logoPath}" alt="${movieTitle || 'Logo'}" class="pause-overlay-logo" />` : `<h2 class="pause-overlay-title">${movieTitle || 'Sin título'}</h2>`}
                      ${metadataHtml}
                      ${synopsisHtml}
                  </div>
                `;

                  pauseOverlay.style.cssText = `
                    position: absolute !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    background: linear-gradient(to right, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.75) 40%, rgba(0, 0, 0, 0.4) 70%, transparent 100%) !important;
                    display: flex !important;
                    align-items: center !important;
                    padding-left: 60px !important;
                    z-index: 2500 !important;
                    opacity: 0 !important;
                    transition: opacity 0.5s ease !important;
                    pointer-events: none !important;
                  `;

                  playerEl.appendChild(pauseOverlay);
                  playerLogger.log('📺 [PAUSE-OVERLAY] Overlay agregado al DOM, z-index: 2500');
                  return pauseOverlay;
                };

                const showPauseOverlay = () => {
                  const overlay = createPauseOverlay();
                  if (overlay) {
                    // Ocultar la barra de controles
                    const controlBar = playerEl.querySelector('.vjs-control-bar') as HTMLElement;
                    if (controlBar) {
                      controlBar.style.opacity = '0';
                      controlBar.style.pointerEvents = 'none';
                    }
                    
                    // Mantener el botón Volver visible aumentando su z-index
                    const backButton = playerEl.querySelector('.vjs-back-button-overlay') as HTMLElement;
                    if (backButton) {
                      backButton.style.zIndex = '2600';
                    }
                    
                    requestAnimationFrame(() => {
                      overlay.style.opacity = '1';
                      playerLogger.log('📺 [PAUSE-OVERLAY] Mostrando información de contenido, controles ocultos');
                    });
                  }
                };

                const hidePauseOverlay = () => {
                  if (pauseOverlay) {
                    pauseOverlay.style.opacity = '0';
                    
                    // Restaurar la barra de controles
                    const controlBar = playerEl.querySelector('.vjs-control-bar') as HTMLElement;
                    if (controlBar) {
                      controlBar.style.opacity = '';
                      controlBar.style.pointerEvents = '';
                    }
                    
                    // Restaurar z-index del botón Volver
                    const backButton = playerEl.querySelector('.vjs-back-button-overlay') as HTMLElement;
                    if (backButton) {
                      backButton.style.zIndex = '2150';
                    }
                    
                    playerLogger.log('📺 [PAUSE-OVERLAY] Ocultando información, controles restaurados');
                  }
                };

                const handlePause = () => {
                  // Cancelar timeout anterior si existe
                  if (pauseOverlayTimeout) {
                    clearTimeout(pauseOverlayTimeout);
                  }
                  
                  // Mostrar overlay después de 5 segundos
                  pauseOverlayTimeout = setTimeout(() => {
                    showPauseOverlay();
                  }, 5000);
                };

                const handlePlay = () => {
                  // Cancelar timeout si el usuario reanuda antes de 5 segundos
                  if (pauseOverlayTimeout) {
                    clearTimeout(pauseOverlayTimeout);
                    pauseOverlayTimeout = null;
                  }
                  hidePauseOverlay();
                };

                // Escuchar eventos de pausa/reproducción
                player.on('pause', handlePause);
                player.on('play', handlePlay);
                player.on('seeking', handlePlay); // Ocultar si el usuario busca
                player.on('seeked', () => {
                  if (player.paused()) {
                    handlePause(); // Reiniciar timer si sigue pausado después de buscar
                  }
                });

                // Función para mostrar feedback visual en el centro
                const showButtonFeedback = (svgContent: string) => {
                  // Crear elemento de feedback
                  const feedback = document.createElement('div');
                  feedback.className = 'vjs-button-feedback';
                  feedback.innerHTML = svgContent;
                  feedback.style.cssText = `
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) scale(0.5);
                    opacity: 0;
                    z-index: 2200;
                    pointer-events: none;
                    transition: all 0.2s ease-out;
                  `;
                  
                  playerEl.appendChild(feedback);
                  
                  // Animar: fade in + zoom in
                  requestAnimationFrame(() => {
                    feedback.style.transform = 'translate(-50%, -50%) scale(1.2)';
                    feedback.style.opacity = '1';
                  });
                  
                  // Después de 150ms: fade out + zoom out
                  setTimeout(() => {
                    feedback.style.transform = 'translate(-50%, -50%) scale(1.5)';
                    feedback.style.opacity = '0';
                    
                    // Eliminar después de la animación
                    setTimeout(() => {
                      feedback.remove();
                    }, 200);
                  }, 150);
                };
                
                // Agregar feedback visual a botones de la barra de controles
                setTimeout(() => {
                  const controlBar = (player as any).controlBar;
                  if (!controlBar) return;
                  
                  // Play/Pause button
                  const playBtn = controlBar.el().querySelector('.vjs-play-control');
                  if (playBtn) {
                    playBtn.addEventListener('click', () => {
                      const isPaused = player.paused();
                      const playSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 384 512" style="transform: translateX(5%);"><path fill="white" d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"></path></svg>`;
                      const pauseSvg = `<svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.5 3a.5.5 0 0 0-.5.5v17a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-17a.5.5 0 0 0-.5-.5h-5Zm10 0a.5.5 0 0 0-.5.5v17a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-17a.5.5 0 0 0-.5-.5h-5Z" fill="white"></path></svg>`;
                      showButtonFeedback(isPaused ? playSvg : pauseSvg);
                    });
                  }
                  
                  // Skip Backward button
                  const backwardBtn = controlBar.el().querySelector('.vjs-skip-backward-button');
                  if (backwardBtn) {
                    backwardBtn.addEventListener('click', () => {
                      const svg = `<svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M11.02 2.048A10 10 0 1 1 2 12H0a12 12 0 1 0 5-9.747V1H3v4a1 1 0 0 0 1 1h4V4H6a10 10 0 0 1 5.02-1.952ZM2 4v3h3v2H1a1 1 0 0 1-1-1V4h2Zm12.125 12c-.578 0-1.086-.141-1.523-.424-.43-.29-.764-.694-.999-1.215-.235-.527-.353-1.148-.353-1.861 0-.707.118-1.324.353-1.851.236-.527.568-.932.999-1.215.437-.29.945-.434 1.523-.434s1.083.145 1.513.434c.437.283.774.688 1.009 1.215.235.527.353 1.144.353 1.851 0 .713-.118 1.334-.353 1.86-.235.522-.572.927-1.009 1.216-.43.283-.935.424-1.513.424Zm0-1.35c.39 0 .696-.186.918-.56.222-.378.333-.909.333-1.59s-.111-1.208-.333-1.581c-.222-.38-.528-.57-.918-.57s-.696.19-.918.57c-.222.373-.333.9-.333 1.581 0 .681.111 1.212.333 1.59.222.374.528.56.918.56Zm-5.521 1.205v-5.139L7 11.141V9.82l3.198-.8v6.835H8.604Z" fill="white"></path></svg>`;
                      showButtonFeedback(svg);
                    });
                  }
                  
                  // Skip Forward button
                  const forwardBtn = controlBar.el().querySelector('.vjs-skip-forward-button');
                  if (forwardBtn) {
                    forwardBtn.addEventListener('click', () => {
                      const svg = `<svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.444 3.685A10 10 0 0 1 18 4h-2v2h4a1 1 0 0 0 1-1V1h-2v1.253A12 12 0 1 0 24 12h-2A10 10 0 1 1 6.444 3.685ZM22 4v3h-3v2h4a1 1 0 0 0 1-1V4h-2Zm-9.398 11.576c.437.283.945.424 1.523.424s1.083-.141 1.513-.424c.437-.29.774-.694 1.009-1.215.235-.527.353-1.148.353-1.861 0-.707-.118-1.324-.353-1.851-.235-.527-.572-.932-1.009-1.215-.43-.29-.935-.434-1.513-.434-.578 0-1.086.145-1.523.434-.43.283-.764.688-.999 1.215-.235.527-.353 1.144-.353 1.851 0 .713.118 1.334.353 1.86.236.522.568.927.999 1.216Zm2.441-1.485c-.222.373-.528.56-.918.56s-.696-.187-.918-.56c-.222-.38-.333-.91-.333-1.591 0-.681.111-1.208.333-1.581.222-.38.528-.57.918-.57s.696.19.918.57c.222.373.333.9.333 1.581 0 .681-.111 1.212-.333 1.59Zm-6.439-3.375v5.14h1.594V9.018L7 9.82v1.321l1.604-.424Z" fill="white"></path></svg>`;
                      showButtonFeedback(svg);
                    });
                  }
                  
                  playerLogger.log('✅ [PLAYER] Feedback visual de botones configurado');
                }, 700);
              }, 600);

              // Función reutilizable para aplicar fix de hover al menú de subtítulos
              const applySubtitleMenuHoverFix = () => {
                const playerEl = player.el();
                if (!playerEl) return;
                
                const subsButton = playerEl.querySelector('.vjs-subs-caps-button, .vjs-subtitles-button, .vjs-captions-button');
                if (!subsButton) return;

                const menu = subsButton.querySelector('.vjs-menu');
                if (!menu) return;

                // Limpiar listeners previos si existen (evitar duplicados)
                const oldListeners = (subsButton as any)._hoverListeners;
                if (oldListeners) {
                  subsButton.removeEventListener('mouseenter', oldListeners.buttonEnter);
                  subsButton.removeEventListener('mouseleave', oldListeners.buttonLeave);
                  menu.removeEventListener('mouseenter', oldListeners.menuEnter);
                  menu.removeEventListener('mouseleave', oldListeners.menuLeave);
                }

                let menuTimeout: ReturnType<typeof setTimeout> | null = null;

                // Nuevos listeners
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

                // Aplicar listeners
                subsButton.addEventListener('mouseenter', buttonEnter);
                subsButton.addEventListener('mouseleave', buttonLeave);
                menu.addEventListener('mouseenter', menuEnter);
                menu.addEventListener('mouseleave', menuLeave);

                // Guardar referencia para poder limpiarlos después
                (subsButton as any)._hoverListeners = {
                  buttonEnter,
                  buttonLeave,
                  menuEnter,
                  menuLeave
                };

                playerLogger.log('✅ [PLAYER] Fix de hover para menú de subtítulos aplicado');
              };

              // Aplicar fix inicialmente
              setTimeout(applySubtitleMenuHoverFix, 700);

              // Cargar subtítulos confirmados automáticamente
              setTimeout(() => {
                loadConfirmedSubtitles();
              }, 1000);

              if (onReady) onReady();
            });

        // Event listeners
        player.on('play', () => {
          playerLogger.log('▶️ [PLAYER] Playing');
        });

        player.on('pause', () => {
          playerLogger.log('⏸️ [PLAYER] Paused');
        });

        player.on('ended', () => {
          playerLogger.log('🏁 [PLAYER] Ended');
        });

        // Listener para actualizaciones de tiempo
        player.on('timeupdate', () => {
          if (onTimeUpdate) {
            const currentTime = player.currentTime();
            if (typeof currentTime === 'number') {
              onTimeUpdate(currentTime);
            }
          }
        });

        player.on('error', () => {
          const error = player.error();
          if (error) {
            logger.error('❌ [PLAYER] Error:', error);
            handleError(`Error del reproductor: ${error.message || 'Error desconocido'}`);
          }
        });

        // Usar 'once' para que solo se ejecute la primera vez
        let hasCalledReady = false;
        player.on('canplay', () => {
          playerLogger.log('✅ [PLAYER] Can play');
          setPlayerState(prev => ({ ...prev, isLoading: false }));
          
          // Solo llamar onReady la primera vez
          if (!hasCalledReady) {
            hasCalledReady = true;
          
          // Verificar si hay un tiempo de resume guardado
          const resumeTime = (window as any).resumeTime;
          if (resumeTime && resumeTime > 0) {
            playerLogger.log(`⏰ [RESUME] Posicionando video en: ${resumeTime}s`);
            
            // Esperar un poco para asegurar que el video esté listo
            setTimeout(() => {
              if (player && typeof player.currentTime === 'function') {
                player.currentTime(resumeTime);
                playerLogger.log(`✅ [RESUME] Video posicionado en: ${resumeTime}s`);
                
                // Limpiar el tiempo de resume
                (window as any).resumeTime = null;
              }
            }, 500);
          }
          
            // Llamar callback onReady si existe (solo la primera vez)
          if (onReady) {
              playerLogger.log('🎯 [PLAYER] Llamando onReady() por primera vez');
            onReady();
            }
          }
        });

        // Recuperación ante stalls/bloqueos SOLO para HLS real (proxy de navegador)
        // NO aplicar a torrents ni archivos directos (GoFile MKV/MP4)
        const isTorrentStream = streamUrl?.includes('/api/stream/proxy/') || false;
        const isHlsStream = streamUrl?.includes('/api/hls-browser-proxy/') || streamUrl?.includes('.m3u8') || false;
        const isDirectFile = !isTorrentStream && !isHlsStream; // GoFile, archivos directos
        
        if (isHlsStream) {
        const recoverFromStall = () => {
          try {
            const ct = player.currentTime();
            if (typeof ct === 'number' && ct > 0) {
                playerLogger.warn('⚠️ [PLAYER] Stall detectado en HLS, aplicando micro-seek para recuperar');
              player.currentTime(ct + 8);
            }
            const p = player.play();
            if (p && typeof (p as any).catch === 'function') {
              (p as any).catch(() => {});
            }
          } catch (e) {
            logger.warn('⚠️ [PLAYER] Error intentando recuperar de stall:', e);
          }
        };

        player.on('waiting', recoverFromStall);
        player.on('stalled', recoverFromStall);
        player.on('suspend', recoverFromStall);
          playerLogger.log('✅ [HLS] Stall recovery habilitado para HLS');
        } else if (isTorrentStream) {
          playerLogger.log('🎬 [TORRENT] Stall recovery deshabilitado para streaming de torrents');
        } else if (isDirectFile) {
          playerLogger.log('📁 [DIRECT-FILE] Stall recovery deshabilitado para archivos directos (GoFile/MKV)');
        }

        player.on('progress', () => {
          const buffered = player.buffered();
          if (buffered.length > 0) {
            const bufferedEnd = buffered.end(buffered.length - 1);
            const duration = player.duration();
            if (duration && duration > 0) {
              const bufferedPercent = (bufferedEnd / duration) * 100;
              setPlayerState(prev => ({ ...prev, progress: bufferedPercent }));
            }
          }
        });

        player.on('loadedmetadata', () => {
          playerLogger.log('📊 [PLAYER] Metadata loaded');
          const playerDuration = player.duration();
          
          // Si tenemos duración del servidor, usarla (más confiable que headers)
          if (videoDuration && videoDuration > 0) {
            playerLogger.log(`📊 [PLAYER] Duración del servidor: ${videoDuration}s, Duración del reproductor: ${playerDuration}s`);
            
            // Si hay diferencia significativa, sobrescribir la duración
            if (playerDuration && Math.abs(videoDuration - playerDuration) > 10) {
              playerLogger.log(`⚠️ [PLAYER] Diferencia significativa detectada. Corrigiendo duración...`);
              
              // Sobrescribir la propiedad duration del elemento video (como el original)
              const tech = player.tech();
              if (tech && tech.el_) {
                Object.defineProperty(tech.el_, 'duration', {
                  get: () => videoDuration,
                  configurable: true
                });
                
                // Disparar evento para actualizar la UI
                player.trigger('durationchange');
                playerLogger.log('✅ [PLAYER] Duración corregida en el reproductor');
              }
            }
            
            setPlayerState(prev => ({ ...prev, duration: videoDuration }));
            playerLogger.log(`✅ [PLAYER] Usando duración del servidor: ${videoDuration}s (${Math.floor(videoDuration / 60)}min)`);
          } else if (playerDuration && playerDuration > 0) {
            playerLogger.log(`📊 [PLAYER] Duración: ${playerDuration}s (${Math.floor(playerDuration / 60)}min)`);
            setPlayerState(prev => ({ ...prev, duration: playerDuration }));
          } else {
            playerLogger.log(`⚠️ [PLAYER] No hay duración disponible aún`);
            setPlayerState(prev => ({ ...prev, duration: null }));
          }
        });

        // 🎯 Reposicionar subtítulos cuando la barra de controles está visible
        // Usamos transform en lugar de bottom para evitar problemas con el renderizado nativo de cues
        const adjustSubtitlePosition = (controlBarVisible: boolean) => {
          const playerEl = playerRef.current?.el();
          if (!playerEl) return;

          const textTrackDisplay = playerEl.querySelector('.vjs-text-track-display') as HTMLElement;
          if (textTrackDisplay) {
            playerLogger.log(`📐 [SUBTITLES] Ajustando posición - Barra visible: ${controlBarVisible}`);
            
            // Eliminar cualquier transición para movimiento instantáneo
            textTrackDisplay.style.transition = 'none';
            textTrackDisplay.style.zIndex = '3';
            
            if (controlBarVisible) {
              // Barra visible: usar transform para mover hacia arriba instantáneamente
              // 120px hacia arriba desde su posición actual
              textTrackDisplay.style.transform = 'translateY(-120px)';
              textTrackDisplay.style.bottom = '2em'; // Mantener bottom original
            } else {
              // Barra oculta: resetear transform
              textTrackDisplay.style.transform = 'translateY(0)';
              textTrackDisplay.style.bottom = '2em';
            }
          }
        };

        // Detectar cuando el usuario interactúa (barra visible)
        player.on('useractive', () => {
          playerLogger.log('👆 [PLAYER] Usuario activo - mostrando barra');
          adjustSubtitlePosition(true);
        });

        // Detectar cuando el usuario deja de interactuar (barra oculta)
        player.on('userinactive', () => {
          playerLogger.log('👋 [PLAYER] Usuario inactivo - ocultando barra');
          adjustSubtitlePosition(false);
        });

        // Ajustar cuando cambia fullscreen
        player.on('fullscreenchange', () => {
          setTimeout(() => {
            const playerEl = playerRef.current?.el();
            const isActive = playerEl?.classList.contains('vjs-user-active');
            playerLogger.log(`🖥️ [PLAYER] Fullscreen cambió - Usuario activo: ${isActive}`);
            adjustSubtitlePosition(isActive || false);
          }, 100);
        });

        // Ajustar cuando se agregan tracks
        player.textTracks().addEventListener('addtrack', () => {
          setTimeout(() => {
            const playerEl = playerRef.current?.el();
            const isActive = playerEl?.classList.contains('vjs-user-active');
            playerLogger.log(`➕ [SUBTITLES] Track agregado - Usuario activo: ${isActive}`);
            adjustSubtitlePosition(isActive || false);
          }, 100);
        });

      } catch (error) {
        logger.error('❌ [PLAYER] Error creando player:', error);
        handleError('Error al inicializar el reproductor');
      }
    }, 100);

      return () => {
        clearTimeout(timer);
        
        // Cleanup al desmontar
        if (playerRef.current) {
          try {
            // Limpiar controles prime antes de dispose
            const playerEl = playerRef.current.el();
            if (playerEl) {
              const primeElements = playerEl.querySelectorAll('.prime-skip-zone, .prime-play-pause-zone');
              primeElements.forEach((el: Element) => el.remove());
            }
            
            playerRef.current.dispose();
          } catch (error) {
            playerLogger.warn('⚠️ [PLAYER] Error disposing:', error);
          }
          playerRef.current = null;
        }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamUrl]);

  // Escuchar evento del plugin para abrir modal
  useEffect(() => {
    playerLogger.log('🎧 [SUBTITLE-SETTINGS] Event listener registrado en window');
    
    const handleOpenSettings = (event: Event) => {
      const customEvent = event as CustomEvent;
      playerLogger.log('📡 [SUBTITLE-SETTINGS] Evento recibido desde plugin:', customEvent.detail);
      
      // Simplemente abrir el modal con el estado actual guardado en React
      // NO sincronizamos con el offset del plugin porque el plugin no se actualiza cuando React cambia
      playerLogger.log('🔄 [SUBTITLE-SETTINGS] Abriendo modal con configuración guardada');
      openSubtitleSettings();
    };

    window.addEventListener('openSubtitleSettings', handleOpenSettings);
    playerLogger.log('✅ [SUBTITLE-SETTINGS] Event listener agregado correctamente');

    return () => {
      playerLogger.log('🔇 [SUBTITLE-SETTINGS] Event listener removido');
      window.removeEventListener('openSubtitleSettings', handleOpenSettings);
    };
  }, [openSubtitleSettings]);

  // Crear botón de audio cuando customStreamUrl esté disponible
  useEffect(() => {
    if (!customStreamUrl || !playerRef.current) {
      return;
    }

    const player = playerRef.current;
    const controlBar = player.getChild('ControlBar');
    if (!controlBar) {
      return;
    }

    const controlBarEl = controlBar.el();
    if (!controlBarEl) {
      return;
    }

    // Verificar si el botón ya existe
    if (controlBarEl.querySelector('.vjs-audio-selector-button')) {
      playerLogger.log('🎧 [AUDIO-BUTTON] Botón ya existe, saltando creación');
      return;
    }

    playerLogger.log('🎧 [AUDIO-BUTTON] Creando botón de audio (customStreamUrl disponible)...');
    
    const audioButton = document.createElement('button');
    audioButton.className = 'vjs-audio-selector-button vjs-control vjs-button';
    audioButton.type = 'button';
    audioButton.title = 'Seleccionar audio';
    audioButton.setAttribute('aria-label', 'Seleccionar audio');
    
    // SVG de auriculares
    audioButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 1.5em; height: 1.5em; display: block; margin: auto;"><g stroke-width="0"/><g stroke-linecap="round" stroke-linejoin="round"/><g fill="currentColor"><path d="M2 12.124C2 6.533 6.477 2 12 2s10 4.533 10 10.124v5.243c0 .817 0 1.378-.143 1.87a3.52 3.52 0 0 1-1.847 2.188c-.458.22-1.004.307-1.801.434l-.13.02a13 13 0 0 1-.727.105c-.209.02-.422.027-.64-.016a2.1 2.1 0 0 1-1.561-1.35 2.2 2.2 0 0 1-.116-.639c-.012-.204-.012-.452-.012-.742v-4.173c0-.425 0-.791.097-1.105a2.1 2.1 0 0 1 1.528-1.43c.316-.073.677-.044 1.096-.01l.093.007.11.01c.783.062 1.32.104 1.775.275q.481.181.883.487v-1.174c0-4.811-3.853-8.711-8.605-8.711s-8.605 3.9-8.605 8.711v1.174c.267-.203.563-.368.883-.487.455-.17.992-.213 1.775-.276l.11-.009.093-.007c.42-.034.78-.063 1.096.01a2.1 2.1 0 0 1 1.528 1.43c.098.314.097.68.097 1.105v4.172c0 .291 0 .54-.012.743-.012.213-.04.427-.116.638a2.1 2.1 0 0 1-1.56 1.35 2.2 2.2 0 0 1-.641.017c-.201-.02-.444-.059-.727-.104l-.13-.02c-.797-.128-1.344-.215-1.801-.436a3.52 3.52 0 0 1-1.847-2.188c-.118-.405-.139-.857-.142-1.461L2 17.58z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M12 5.75a.75.75 0 0 1 .75.75v5a.75.75 0 1 1-1.5 0v-5a.75.75 0 0 1 .75-.75m3 1.5a.75.75 0 0 1 .75.75v2a.75.75 0 1 1-1.5 0V8a.75.75 0 0 1 .75-.75m-6 0a.75.75 0 0 1 .75.75v2a.75.75 0 0 1-1.5 0V8A.75.75 0 0 1 9 7.25"/></g></svg>
    `;

    // Event listener
    audioButton.addEventListener('click', () => {
      playerLogger.log('🎧 [AUDIO-BUTTON] Click detectado');
      if (onToggleAudioMenu) {
        onToggleAudioMenu();
      }
    });

    // Insertar antes del botón de fullscreen
    const fullscreenButton = controlBarEl.querySelector('.vjs-fullscreen-control');
    if (fullscreenButton) {
      controlBarEl.insertBefore(audioButton, fullscreenButton);
      playerLogger.log('✅ [AUDIO-BUTTON] Botón de audio insertado antes de Fullscreen');
    } else {
      controlBarEl.appendChild(audioButton);
      playerLogger.log('⚠️ [AUDIO-BUTTON] Fullscreen no encontrado, agregado al final');
    }

    // Aplicar estilos de tamaño
    (audioButton as HTMLElement).style.cssText = 'width: 72px !important; height: 72px !important; min-width: 72px !important; min-height: 72px !important;';
    const svg = audioButton.querySelector('svg');
    if (svg) {
      svg.style.width = '36px';
      svg.style.height = '36px';
    }

    // Reorganizar controles después de agregar el botón
    setTimeout(() => {
      const setupPixelPerfectCenter = () => {
        const controlBarEl = controlBar.el();
        if (!controlBarEl) return;
        
        // Lógica de reorganización (simplificada, solo para asegurar que el botón esté visible)
        playerLogger.log('🔄 [AUDIO-BUTTON] Reorganizando controles después de agregar botón de audio');
      };
      setupPixelPerfectCenter();
    }, 100);
  }, [customStreamUrl, onToggleAudioMenu]);

  return {
    videoRef,
    playerRef,
    playerState,
    addSubtitle,
    addSubtitleFromUrl,
    togglePlayPause,
    seek,
    setVolume,
    openSubtitleSettings,
    closeSubtitleSettings,
    applySubtitleSettings,
    loadConfirmedSubtitles,
  };
}