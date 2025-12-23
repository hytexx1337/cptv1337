'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { logger } from '@/lib/logger';
import { SpeakerWaveIcon, SpeakerXMarkIcon, PlayIcon, PauseIcon } from '@heroicons/react/24/solid';

interface PreviewPlayerProps {
  type: 'movie' | 'tv';
  tmdbId: number;
  imdbId?: string;
  title: string;
  season?: number; // Para series, siempre será 1
  episode?: number; // Para series, siempre será 1
  onError?: (error: string) => void;
  onReady?: () => void; // Callback cuando el video está listo
  onEnded?: () => void; // Callback cuando termina el preview
  onMuteChange?: (isMuted: boolean) => void; // Callback cuando cambia el estado de mute
  onPlayerRef?: (ref: { toggleMute: () => void }) => void; // Exponer métodos al padre
}

export default function PreviewPlayer({
  type,
  tmdbId,
  imdbId,
  title,
  season = 1,
  episode = 1,
  onError,
  onReady,
  onEnded,
  onMuteChange,
  onPlayerRef,
}: PreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [subtitles, setSubtitles] = useState<Array<{ url: string; language: string; label: string }>>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');
  const [subtitlesParsed, setSubtitlesParsed] = useState(false); // Estado para disparar el useEffect del interval
  const [scrolledAway, setScrolledAway] = useState(false); // Estado para detectar si el usuario hizo scroll
  const [videoOpacity, setVideoOpacity] = useState(1); // Opacidad del video controlada por scroll
  const startTimeRef = useRef<number>(0);
  const fadeIntervalRef = useRef<number | null>(null);
  const parsedSubtitlesRef = useRef<Array<{ start: number; end: number; text: string }>>([]);
  const scrollThreshold = 200; // Pixels de scroll para activar fade

  // Ref para evitar múltiples fetches (React Strict Mode)
  const fetchExecutedRef = useRef(false);

  // Obtener el stream
  useEffect(() => {
    // Prevenir múltiples fetches
    if (fetchExecutedRef.current) {
      logger.log('⏭️ [PREVIEW] Fetch ya ejecutado, saltando');
      return;
    }

    const fetchStream = async () => {
      try {
        fetchExecutedRef.current = true;
        logger.log(`🎬 [PREVIEW] Obteniendo stream para ${type}...`, { tmdbId, season, episode });

        // 🎬 Usar Vidlink para stream y subtítulos (simple y confiable)
        logger.log('🔄 [PREVIEW] Obteniendo stream de Vidlink...');
        
        const params = new URLSearchParams({
          type,
          id: imdbId || tmdbId.toString(),
        });

        if (type === 'tv') {
          params.set('season', season.toString());
          params.set('episode', episode.toString());
        }

        const response = await fetch(`/api/hls-browser-proxy/start?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error('No se pudo obtener stream de Vidlink');
        }

        const data = await response.json();
        
        if (!data.playlistUrl) {
          throw new Error('Vidlink no devolvió stream URL');
        }

        logger.log('✅ [PREVIEW] Stream obtenido (VIDLINK):', data.playlistUrl);
        setStreamUrl(data.playlistUrl);

        // Usar subtítulos de Vidlink (búsqueda inteligente de español)
        if (data.subtitles && data.subtitles.length > 0) {
          logger.log(`📝 [PREVIEW] Vidlink devolvió ${data.subtitles.length} subtítulos`);
          
          // Log de todos los subtítulos disponibles para debugging
          data.subtitles.forEach((sub: any, idx: number) => {
            logger.log(`  [${idx}] ${sub.label || 'Unknown'} (${sub.language || 'unknown'}) - ${sub.url?.substring(0, 80)}...`);
          });
          
          // Búsqueda inteligente de español (en orden de prioridad)
          let spanishSub = data.subtitles.find((sub: any) => {
            const lang = (sub.language || '').toLowerCase();
            const label = (sub.label || '').toLowerCase();
            const url = (sub.url || '').toLowerCase();
            
            // Buscar códigos de idioma español
            if (lang === 'es' || lang === 'spa' || lang === 'esp') return true;
            
            // Buscar en el label
            if (label.includes('español') || label.includes('spanish') || label.includes('castellano')) return true;
            
            // Buscar en la URL (muchas veces el archivo tiene el idioma)
            if (url.includes('spa') || url.includes('spanish') || url.includes('español') || url.includes('castellano')) return true;
            
            return false;
          });
          
          // Si no encontramos español, usar inglés como fallback
          if (!spanishSub) {
            logger.warn('⚠️ [PREVIEW] No se encontró subtítulo en español, buscando inglés...');
            spanishSub = data.subtitles.find((sub: any) => {
              const lang = (sub.language || '').toLowerCase();
              const label = (sub.label || '').toLowerCase();
              return lang === 'en' || lang === 'eng' || label.includes('english');
            });
          }
          
          // Si tampoco hay inglés, usar el primero que no sea "Unknown"
          if (!spanishSub) {
            logger.warn('⚠️ [PREVIEW] No se encontró ni español ni inglés, usando primer subtítulo conocido...');
            spanishSub = data.subtitles.find((sub: any) => 
              sub.language && sub.language !== 'unknown' && sub.label && sub.label !== 'Unknown'
            );
          }
          
          // Como último recurso, usar el primero
          const selectedSub = spanishSub || data.subtitles[0];
          
          logger.log(`✅ [PREVIEW] Subtítulo seleccionado: ${selectedSub.label || 'Unknown'} (${selectedSub.language || 'unknown'})`);
          
          setSubtitles([{
            url: selectedSub.url,
            language: selectedSub.language || 'es',
            label: selectedSub.label || 'Español'
          }]);
        } else {
          logger.log('ℹ️ [PREVIEW] No hay subtítulos disponibles en Vidlink');
          setSubtitles([]);
        }

        // Calcular timestamp inicial
        // Series: minuto 15 (900 segundos)
        // Películas: random entre minuto 5 y 25 (300-1500 segundos)
        if (type === 'tv') {
          startTimeRef.current = 15 * 60; // 900 segundos
        } else {
          // Random entre 5 y 25 minutos
          const randomMinute = 5 + Math.floor(Math.random() * 20);
          startTimeRef.current = randomMinute * 60;
        }
        
        logger.log(`⏰ [PREVIEW] Timestamp inicial: ${startTimeRef.current}s (${Math.floor(startTimeRef.current / 60)} min)`);
        setLoading(false);
      } catch (err: any) {
        logger.error('❌ [PREVIEW] Error obteniendo stream:', err);
        setError(err.message);
        setLoading(false);
        onError?.(err.message);
      }
    };

    fetchStream();
  }, [type, tmdbId, imdbId, season, episode, onError]);

  // Parsear subtítulos VTT cuando se seleccionen
  useEffect(() => {
    if (subtitles.length === 0) {
      setSubtitlesParsed(false); // Reset si no hay subtítulos
      parsedSubtitlesRef.current = [];
      return;
    }

    // Validar que el subtítulo tenga URL válida
    if (!subtitles[0]?.url) {
      logger.warn('⚠️ [PREVIEW-SUBTITLES] Subtítulo sin URL válida');
      setSubtitlesParsed(false);
      parsedSubtitlesRef.current = [];
      return;
    }

    setSubtitlesParsed(false); // Reset antes de parsear

    const parseSubtitles = async () => {
      try {
        const subtitleUrl = subtitles[0].url;
        logger.log('📄 [PREVIEW-SUBTITLES] Descargando subtítulos:', subtitleUrl);
        
        const response = await fetch(subtitleUrl);
        
        // Si falla (403, 404, etc.), no es fatal - simplemente no mostramos subtítulos
        if (!response.ok) {
          logger.warn(`⚠️ [PREVIEW-SUBTITLES] No se pudieron cargar subtítulos (${response.status}). Continuando sin subtítulos.`);
          parsedSubtitlesRef.current = [];
          setSubtitlesParsed(true); // Marcar como "parseado" (vacío) para continuar
          return;
        }
        
        const vttContent = await response.text();
        
        // Parsear VTT
        const lines = vttContent.split('\n');
        const parsed: Array<{ start: number; end: number; text: string }> = [];
        
        // Función para convertir timestamp a segundos
        const timeToSeconds = (timeStr: string): number => {
          try {
            // Remover espacios y reemplazar coma por punto
            const cleaned = timeStr.trim().replace(',', '.');
            
            // Formato: HH:MM:SS.mmm o MM:SS.mmm
            const parts = cleaned.split(':');
            
            if (parts.length === 3) {
              // HH:MM:SS.mmm
              const hours = parseInt(parts[0], 10);
              const minutes = parseInt(parts[1], 10);
              const seconds = parseFloat(parts[2]);
              return hours * 3600 + minutes * 60 + seconds;
            } else if (parts.length === 2) {
              // MM:SS.mmm
              const minutes = parseInt(parts[0], 10);
              const seconds = parseFloat(parts[1]);
              return minutes * 60 + seconds;
            } else if (parts.length === 1) {
              // SS.mmm
              return parseFloat(parts[0]);
            }
            
            logger.warn(`⚠️ [PREVIEW-SUB-PARSE] Formato de tiempo no reconocido: "${timeStr}"`);
            return 0;
          } catch (err) {
            logger.error(`❌ [PREVIEW-SUB-PARSE] Error parseando timestamp "${timeStr}":`, err);
            return 0;
          }
        };
        
        let i = 0;
        let parsedCount = 0;
        while (i < lines.length) {
          const line = lines[i].trim();
          
          // Buscar timestamp (00:00:00.000 --> 00:00:05.000)
          if (line.includes('-->')) {
            const [startStr, endStr] = line.split('-->');
            
            const start = timeToSeconds(startStr);
            const end = timeToSeconds(endStr);
            
            // Debug: Log del primer timestamp parseado
            if (parsedCount === 0) {
              logger.log(`🔍 [PREVIEW-SUB-PARSE] Primer timestamp raw: "${line}"`);
              logger.log(`   Start: "${startStr.trim()}" → ${start.toFixed(2)}s`);
              logger.log(`   End: "${endStr.trim()}" → ${end.toFixed(2)}s`);
            }
            
            // Recopilar texto (puede ser múltiples líneas)
            i++;
            let text = '';
            while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
              const textLine = lines[i].trim();
              // Saltar líneas numéricas (identificadores de subtítulo)
              if (!/^\d+$/.test(textLine)) {
                text += (text ? '\n' : '') + textLine;
              }
              i++;
            }
            
            if (text && start >= 0 && end > start) {
              // Limpiar tags HTML/VTT
              text = text.replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '');
              parsed.push({ start, end, text });
              parsedCount++;
            }
          }
          i++;
        }
        
        parsedSubtitlesRef.current = parsed;
        logger.log(`✅ [PREVIEW-SUBTITLES] ${parsed.length} subtítulos parseados`);
        
        // Log de algunos timestamps para debugging
        if (parsed.length > 0) {
          logger.log(`📊 [PREVIEW-SUBTITLES] Primer subtítulo: ${parsed[0].start.toFixed(1)}s - ${parsed[0].end.toFixed(1)}s`);
          logger.log(`📊 [PREVIEW-SUBTITLES] Último subtítulo: ${parsed[parsed.length - 1].start.toFixed(1)}s - ${parsed[parsed.length - 1].end.toFixed(1)}s`);
          
          // Buscar subtítulos alrededor del minuto 15 (900s)
          const subsAround900 = parsed.filter(sub => sub.start >= 890 && sub.start <= 910);
          if (subsAround900.length > 0) {
            logger.log(`📊 [PREVIEW-SUBTITLES] Subtítulos alrededor del minuto 15 (900s): ${subsAround900.length}`);
            subsAround900.slice(0, 5).forEach((sub, idx) => {
              logger.log(`   [${idx}] ${sub.start.toFixed(1)}s → ${sub.end.toFixed(1)}s: "${sub.text.substring(0, 40)}..."`);
            });
          } else {
            logger.warn(`⚠️ [PREVIEW-SUBTITLES] No hay subtítulos alrededor del minuto 15 (900s)`);
          }
          
          // Notificar que los subtítulos están listos para disparar el interval
          setSubtitlesParsed(true);
          logger.log(`✅ [PREVIEW-SUBTITLES] Subtítulos listos para sincronización`);
        }
      } catch (err) {
        logger.error('❌ [PREVIEW-SUBTITLES] Error parseando subtítulos:', err);
      }
    };

    parseSubtitles();

    // Cleanup: Liberar la URL del Blob cuando el componente se desmonte o cambien los subtítulos
    return () => {
      if (subtitles.length > 0 && subtitles[0]?.url?.startsWith('blob:')) {
        logger.log('🧹 [PREVIEW-SUBTITLES] Liberando Blob URL');
        URL.revokeObjectURL(subtitles[0].url);
      }
    };
  }, [subtitles]);

  // Actualizar subtítulo actual basándose en currentTime
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !subtitlesParsed || parsedSubtitlesRef.current.length === 0) {
      logger.log(`⏸️ [PREVIEW-SUB-INTERVAL] No se puede iniciar interval: video=${!!video}, subtitlesParsed=${subtitlesParsed}, subtitles=${parsedSubtitlesRef.current.length}`);
      return;
    }

    logger.log(`✅ [PREVIEW-SUB-INTERVAL] Iniciando interval de actualización de subtítulos (${parsedSubtitlesRef.current.length} subtítulos)`);
    let debugLogCount = 0;

    const updateSubtitle = () => {
      // Usar currentTime directamente del video (ya está en la posición correcta)
      const currentTime = video.currentTime;
      
      // Log detallado cada 50 llamadas (~5 segundos)
      debugLogCount++;
      if (debugLogCount % 50 === 1) {
        const nearSubtitles = parsedSubtitlesRef.current.filter(
          (sub) => Math.abs(sub.start - currentTime) < 10
        );
        logger.log(`🔍 [PREVIEW-SUB-DEBUG] currentTime=${currentTime.toFixed(1)}s, subtítulos cercanos: ${nearSubtitles.length}`);
        if (nearSubtitles.length > 0) {
          nearSubtitles.slice(0, 3).forEach(sub => {
            const inRange = currentTime >= sub.start && currentTime <= sub.end;
            logger.log(`   ${inRange ? '✅' : '❌'} ${sub.start.toFixed(1)}s → ${sub.end.toFixed(1)}s: "${sub.text.substring(0, 30)}..."`);
          });
        }
      }
      
      const subtitle = parsedSubtitlesRef.current.find(
        (sub) => currentTime >= sub.start && currentTime <= sub.end
      );
      
      if (subtitle && subtitle.text !== currentSubtitle) {
        setCurrentSubtitle(subtitle.text);
        logger.log(`📝 [PREVIEW-SUB] Mostrando: "${subtitle.text.substring(0, 30)}..." @ ${currentTime.toFixed(1)}s`);
      } else if (!subtitle && currentSubtitle !== '') {
        setCurrentSubtitle('');
      }
    };

    // Actualizar cada 100ms para sincronización suave
    const interval = setInterval(updateSubtitle, 100);
    
    return () => {
      logger.log(`🛑 [PREVIEW-SUB-INTERVAL] Deteniendo interval de subtítulos`);
      clearInterval(interval);
    };
  }, [subtitlesParsed, currentSubtitle]);

  // Configurar hls.js y el video cuando el stream esté listo
  useEffect(() => {
    // Esperar a que termine de cargar para asegurar que el video esté renderizado
    if (loading || !streamUrl) {
      logger.log('⏳ [PREVIEW] Esperando... loading:', loading, 'streamUrl:', !!streamUrl);
      return;
    }

    const video = videoRef.current;
    if (!video) {
      logger.warn('⚠️ [PREVIEW] videoRef.current es null, esperando re-render...');
      return;
    }

    logger.log('🎬 [PREVIEW] Configurando hls.js para:', streamUrl);

    // Cleanup anterior si existe
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Verificar si es HLS
    const isHLS = streamUrl.includes('.m3u8') || streamUrl.includes('/m3u8') || streamUrl.includes('.txt');

    // Definir handler ANTES de cargar el video para asegurar que se capture el evento
    const handleLoadedMetadata = () => {
      logger.log('📊 [PREVIEW] Metadata cargada (Safari/directo), posicionando en timestamp inicial');
      video.currentTime = startTimeRef.current;
    };

    if (isHLS && Hls.isSupported()) {
      logger.log('✅ [PREVIEW] Usando hls.js');
      
      const hls = new Hls({
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
        startLevel: -1,
        enableWorker: true,
      });

      hls.attachMedia(video);
      hls.loadSource(streamUrl);
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        logger.log('✅ [PREVIEW] Manifest parseado, posicionando en timestamp inicial');
        // Setear currentTime cuando el manifest está listo
        video.currentTime = startTimeRef.current;
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          logger.error('❌ [PREVIEW] Error fatal en hls.js:', data);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setError('Error al cargar el video');
              break;
          }
        }
      });
    } else {
      // Para Safari nativo y video directo, agregar listener ANTES de setear src
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      
      if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari nativo
        logger.log('✅ [PREVIEW] Usando HLS nativo de Safari');
        video.src = streamUrl;
      } else {
        // No es HLS o video directo
        logger.log('✅ [PREVIEW] Reproducción directa');
        video.src = streamUrl;
      }
    }

    // Fade in del volumen
    const fadeInVolume = () => {
      if (!video || video.muted) return;
      
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }

      video.volume = 0;
      const targetVolume = 0.5;
      const fadeStep = 0.02;

      fadeIntervalRef.current = setInterval(() => {
        if (video.volume < targetVolume - fadeStep) {
          video.volume = Math.min(targetVolume, video.volume + fadeStep);
        } else {
          video.volume = targetVolume;
          if (fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current);
          }
        }
      }, 50) as unknown as number;
    };

    // Fade out del volumen
    const fadeOutVolume = (callback?: () => void) => {
      if (!video || video.muted) {
        callback?.();
        return;
      }
      
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }

      const fadeStep = 0.05;

      fadeIntervalRef.current = setInterval(() => {
        if (video.volume > fadeStep) {
          video.volume = Math.max(0, video.volume - fadeStep);
        } else {
          video.volume = 0;
          if (fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current);
          }
          callback?.();
        }
      }, 50) as unknown as number;
    };

    const handleCanPlay = () => {
      logger.log('✅ [PREVIEW] Listo para reproducir');
      setIsReady(true);
      onReady?.(); // Notificar al padre que está listo
      
      // Auto-play con fade in de volumen
      video.play().then(() => {
        setIsPlaying(true);
        fadeInVolume();
        logger.log('▶️ [PREVIEW] Reproducción iniciada con fade-in');
      }).catch(err => {
        logger.error('❌ [PREVIEW] Error en autoplay:', err);
        // Si falla autoplay, mutear y reintentar
        video.muted = true;
        setIsMuted(true);
        video.play().then(() => {
          setIsPlaying(true);
          logger.log('▶️ [PREVIEW] Reproducción iniciada (muted)');
        });
      });
    };

    const handleTimeUpdate = () => {
      const elapsed = video.currentTime - startTimeRef.current;
      
      // Log cada 5 segundos para debugging
      if (Math.floor(video.currentTime) % 5 === 0 && Math.floor(video.currentTime) !== Math.floor(video.currentTime - 0.5)) {
        logger.log(`⏱️ [PREVIEW] currentTime: ${video.currentTime.toFixed(1)}s, elapsed: ${elapsed.toFixed(1)}s, currentSubtitle: "${currentSubtitle.substring(0, 30)}"`);
      }
      
      // Detener después de 1 minuto con fade out
      if (elapsed >= 60) {
        logger.log('⏹️ [PREVIEW] 1 minuto completado, iniciando fade-out');
        fadeOutVolume(() => {
          video.pause();
          setIsPlaying(false);
          setIsReady(false); // Ocultar el video
          logger.log('✅ [PREVIEW] Fade-out completado, notificando al padre');
          onEnded?.(); // Notificar al padre para volver al backdrop
        });
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    // Los listeners de loadedmetadata ya se agregaron arriba según el tipo de reproducción:
    // - HLS.js usa el evento MANIFEST_PARSED
    // - Safari/directo usa loadedmetadata (agregado antes de setear src)
    
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      // Para Safari/directo, remover el listener que agregamos arriba
      if (!isHLS || !Hls.isSupported()) {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      }
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);

      // Limpiar fade interval
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }

      // Limpiar hls.js
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, loading, onReady, onEnded]);

  // Detectar scroll para fade in/out y pause/play
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const video = videoRef.current;
      
      if (scrollY > scrollThreshold) {
        // Scroll hacia abajo: fade out y pausar
        if (!scrolledAway) {
          logger.log('📜 [PREVIEW-SCROLL] Usuario hizo scroll down, fade out y pause');
          setScrolledAway(true);
          setVideoOpacity(0);
          
          if (video && isPlaying) {
            video.pause();
          }
        }
      } else {
        // Scroll hacia arriba (o en el top): fade in y reproducir
        if (scrolledAway) {
          logger.log('📜 [PREVIEW-SCROLL] Usuario volvió arriba, fade in y play');
          setScrolledAway(false);
          setVideoOpacity(1);
          
          if (video && !isPlaying && isReady) {
            video.play().catch(err => {
              logger.warn('⚠️ [PREVIEW-SCROLL] No se pudo reproducir al volver:', err);
            });
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [scrolledAway, isPlaying, isReady]);

  const toggleMute = useCallback(() => {
    logger.log('🔊 [PREVIEW-MUTE] Toggle mute llamado');
    if (videoRef.current) {
      const newMutedState = !videoRef.current.muted;
      videoRef.current.muted = newMutedState;
      setIsMuted(newMutedState);
      onMuteChange?.(newMutedState); // Notificar al padre
      logger.log(`🔊 [PREVIEW-MUTE] Estado cambiado a: ${newMutedState ? 'MUTEADO' : 'CON SONIDO'}`);
    } else {
      logger.warn('⚠️ [PREVIEW-MUTE] videoRef.current es null');
    }
  }, [onMuteChange]);

  // Exponer método toggleMute al padre
  useEffect(() => {
    if (isReady && onPlayerRef) {
      onPlayerRef({ toggleMute });
      logger.log('✅ [PREVIEW] Referencia del player expuesta al padre');
    }
  }, [isReady, toggleMute, onPlayerRef]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  // No mostrar nada si está cargando o hay error (el padre manejará el backdrop)
  if (loading || error || !streamUrl) {
    return null;
  }

  return (
    <div className="relative w-full h-full group pointer-events-none">
        {/* Video - Con opacidad controlada por scroll y ready state */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover transition-opacity duration-1000 pointer-events-auto"
          style={{ opacity: isReady ? videoOpacity : 0 }}
          playsInline
        />

      {/* Overlay con controles de Play/Pause (hover) */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        {/* Controles en la esquina inferior derecha (solo Play/Pause) */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2 pointer-events-auto">
          {/* Botón Play/Pause */}
          <button
            onClick={togglePlay}
            className="p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors pointer-events-auto"
            title={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isPlaying ? (
              <PauseIcon className="w-5 h-5 text-white" />
            ) : (
              <PlayIcon className="w-5 h-5 text-white" />
            )}
          </button>
        </div>

        {/* Badge de "Preview" */}
        <div className="absolute top-4 left-4">
          <div className="px-3 py-1 bg-red-600/90 rounded-md backdrop-blur-sm">
            <span className="text-white text-xs font-semibold">Preview</span>
          </div>
        </div>
      </div>

        {/* Subtítulos - Alineados a la derecha, sin fondo, solo sombra */}
        {currentSubtitle && isReady && (
          <div className="absolute bottom-[20%] right-[25%] max-w-[50%] text-right pointer-events-none z-50">
            <div className="inline-block">
              {currentSubtitle.split('\n').map((line, index) => (
                <p 
                  key={index} 
                  className="text-white font-semibold leading-snug"
                  style={{
                    fontSize: '2.44rem',
                    textShadow: '3px 3px 6px rgba(0,0,0,0.95), -2px -2px 4px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.9)',
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
  );
}

