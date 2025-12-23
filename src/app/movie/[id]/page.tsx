'use client';

import { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { StarIcon, CalendarIcon, ClockIcon, PlayIcon, ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, BookmarkIcon, CheckIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid';
import LoadingSpinner from '@/components/LoadingSpinner';
import DetailPageSkeleton from '@/components/DetailPageSkeleton';
import { MovieDetails, Cast, TMDBImages, Movie } from '@/types/tmdb';
import { getImageUrl, formatRating, getYear } from '@/lib/tmdb';
import { useTorrentSearch } from '@/hooks/useTorrentSearch';
import { useDownloadedFiles } from '@/hooks/useDownloadedFiles';
import { logger, playerLogger } from '@/lib/logger';
import { watchHistory } from '@/lib/watch-history';
import { toggleWatchlist, isInWatchlist } from '@/lib/watchlist';
import Header from '@/components/Header';
import DetailHeroSection from '@/components/DetailHeroSection';

// ⚡ Lazy load del player (reduce bundle inicial en ~500KB)
const StreamingPlayer = dynamic(() => import('@/components/streaming/StreamingPlayer'), {
  loading: () => <LoadingSpinner />,
  ssr: false
});

type TabView = 'recomendaciones' | 'detalles';

// Helper para obtener el logo original (solo en inglés)
const getOriginalLogo = (images: TMDBImages | null): string | undefined => {
  if (!images?.logos || images.logos.length === 0) return undefined;
  
  // Solo aceptar logos en inglés
  const englishLogo = images.logos.find(logo => logo.iso_639_1 === 'en');
  
  return englishLogo?.file_path ? getImageUrl(englishLogo.file_path, 'original') : undefined;
};

// Helper para formatear duración en horas y minutos
const formatRuntime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${mins}m`;
  }
};

export default function MovieDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [movie, setMovie] = useState<MovieDetails | null>(null);
  
  // Ref para trackear si ya se ejecutó fetchStreams para esta película
  const fetchStreamsExecutedRef = useRef<number | null>(null);
  const [cast, setCast] = useState<Cast[]>([]);
  const [images, setImages] = useState<TMDBImages | null>(null);
  const [similarMovies, setSimilarMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para tabs y streaming
  const [activeTab, setActiveTab] = useState<TabView>('recomendaciones');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  
  // Watch Party - Guardar en estado para que persista
  const [watchPartyRoomId, setWatchPartyRoomId] = useState<string | null>(null);
  const [watchPartyUsername, setWatchPartyUsername] = useState<string | null>(null);
  const [showUsernameModal, setShowUsernameModal] = useState(false);

  // Estado para el botón de mute del preview
  const [showMuteButton, setShowMuteButton] = useState(false);
  const [previewIsMuted, setPreviewIsMuted] = useState(false);
  const [togglePreviewMute, setTogglePreviewMute] = useState<(() => void) | null>(null);
  
  // Inicializar roomId una sola vez
  useEffect(() => {
    const roomId = searchParams.get('watchparty');
    if (roomId && !watchPartyRoomId) {
      console.log('🎯 [DEBUG] Guardando roomId en estado:', roomId);
      setWatchPartyRoomId(roomId);
    }
  }, [searchParams, watchPartyRoomId]);
  
  // Cargar username al montar el componente
  useEffect(() => {
    const urlUsername = searchParams.get('username');
    const savedUsername = localStorage.getItem('watchparty-username');
    
    console.log('🔍 [DEBUG] watchPartyRoomId:', watchPartyRoomId);
    console.log('🔍 [DEBUG] urlUsername:', urlUsername);
    console.log('🔍 [DEBUG] savedUsername:', savedUsername);
    
    if (urlUsername) {
      console.log('✅ [DEBUG] Setting username from URL:', urlUsername);
      setWatchPartyUsername(urlUsername);
      localStorage.setItem('watchparty-username', urlUsername);
    } else if (savedUsername) {
      console.log('✅ [DEBUG] Setting username from localStorage:', savedUsername);
      setWatchPartyUsername(savedUsername);
    }
  }, [searchParams, watchPartyRoomId]);
  
  // Si hay roomId pero no username, mostrar modal
  useEffect(() => {
    console.log('🔍 [DEBUG] Modal check - roomId:', watchPartyRoomId, 'username:', watchPartyUsername);
    if (watchPartyRoomId && !watchPartyUsername) {
      console.log('📝 [DEBUG] Mostrando modal de username');
      setShowUsernameModal(true);
    }
  }, [watchPartyRoomId, watchPartyUsername]);
  

  // Detectar cambios en el estado de pantalla completa
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  const [selectedMagnet, setSelectedMagnet] = useState<string | null>(null);
  const [goFileUrl, setGoFileUrl] = useState<string | null>(null);
  const [directStreamUrl, setDirectStreamUrl] = useState<string | null>(null);
  const [externalSubtitles, setExternalSubtitles] = useState<Array<{ url: string; language: string; label: string }>>([]);
  const [torrentError, setTorrentError] = useState<string | null>(null);
  const [showTorrents, setShowTorrents] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<string | null>(null);
  const [customStreamUrl, setCustomStreamUrl] = useState<string | null>(null); // Stream personalizado (español latino)
  const [englishDubStreamUrl, setEnglishDubStreamUrl] = useState<string | null>(null); // Stream en inglés doblado
  // Estado para captura online desde 111movies
  const [capturingOnline, setCapturingOnline] = useState<boolean>(false);
  const [videoHasStarted, setVideoHasStarted] = useState(false);
  
  // Ref para el carrusel
  const carouselRef = useRef<HTMLDivElement>(null);
  
  const { searchMovieTorrents, torrents, isLoading: loadingTorrents } = useTorrentSearch({
    onError: (error) => setTorrentError(error),
  });

  const { downloadedFiles, getMovieFiles, preloadNextEpisodes, preloadSeason, updateLastAccessed } = useDownloadedFiles();
  
  // Estados para archivos descargados
  const [selectedDownloadedFile, setSelectedDownloadedFile] = useState<any>(null);
  const [downloadedFilesState, setDownloadedFiles] = useState<any[]>([]);

  // Funciones para el carrusel
  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const scrollAmount = carouselRef.current.offsetWidth;
      carouselRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Función para normalizar calidades
  const normalizeQuality = (quality: string | undefined): string | null => {
    if (!quality || quality === 'Unknown') return null;
    
    // Normalizar variaciones comunes
    const upper = quality.toUpperCase();
    if (upper.includes('2160') || upper.includes('4K') || upper.includes('UHD')) return '4K';
    if (upper.includes('1080')) return '1080p';
    if (upper.includes('720')) return '720p';
    if (upper.includes('480')) return '480p';
    
    return quality;
  };

  // Agrupar torrents por calidad normalizada (filtrar Unknown)
  const torrentsByQuality = torrents.reduce((acc, torrent) => {
    const normalizedQuality = normalizeQuality(torrent.quality);
    
    // Filtrar Unknown (null)
    if (!normalizedQuality) return acc;
    
    if (!acc[normalizedQuality]) {
      acc[normalizedQuality] = [];
    }
    acc[normalizedQuality].push(torrent);
    return acc;
  }, {} as Record<string, typeof torrents>);

  // Ordenar cada grupo por seeds
  Object.keys(torrentsByQuality).forEach(quality => {
    torrentsByQuality[quality].sort((a, b) => (b.seeds || 0) - (a.seeds || 0));
  });

  // Obtener calidades disponibles ordenadas (4K > 1080p > 720p > resto)
  const qualityOrder: Record<string, number> = {
    '4K': 4,
    '1080p': 3,
    '720p': 2,
    '480p': 1,
  };

  const availableQualities = Object.keys(torrentsByQuality).sort((a, b) => {
    const orderA = qualityOrder[a] || 0;
    const orderB = qualityOrder[b] || 0;
    return orderB - orderA;
  });

  // Obtener streams (inglés + latino) usando API unificada con modo rápido + polling
  // ⚠️ DESHABILITADO: Ahora usamos Vidify directamente en handlePlay y autoplay
  // Este useEffect llamaba a la API vieja /api/streams/unified que no existe más
  /*
  useEffect(() => {
    if (!movie) return;
    
    // Si ya se ejecutó fetchStreams para esta película, salir
    if (fetchStreamsExecutedRef.current === movie.id) {
      logger.log(`⏭️ [FETCH-STREAMS] Ya se ejecutó para película ${movie.id}, saliendo`);
      return;
    }
    
    // Marcar como ejecutado
    fetchStreamsExecutedRef.current = movie.id;
    logger.log(`🎯 [FETCH-STREAMS] Marcando como ejecutado: ${movie.id}`);
    
    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let isPolling = false;
    
    const fetchStreams = async (quick = true) => {
      try {
        const quickParam = quick ? '&quick=true' : '';
        logger.log(`🔍 [UNIFIED-API] Obteniendo streams para película ${movie.id}${quick ? ' (modo rápido)' : ''}`);
        
        const response = await fetch(
          `/api/streams/unified?type=movie&id=${movie.id}${quickParam}`
        );
        
        if (response.ok) {
          const data = await response.json();
          
          logger.log(`📊 [UNIFIED-API] Respuesta recibida:`, {
            hasOriginal: !!data.original?.streamUrl,
            hasLatino: !!data.latino?.streamUrl,
            currentDirectStream: !!directStreamUrl
          });
          
          // Stream original (inglés) - solo si no hay uno ya seleccionado
          if (data.original?.streamUrl && !directStreamUrl) {
            logger.log('✅ [UNIFIED-API] Stream original (inglés) encontrado');
            setDirectStreamUrl(data.original.streamUrl);
            if (data.original.subtitles) {
              setExternalSubtitles(data.original.subtitles);
            }
          }
          
          // Stream latino
          if (data.latino?.streamUrl) {
            logger.log('✅ [UNIFIED-API] Stream latino encontrado');
            setCustomStreamUrl(data.latino.streamUrl);
            
            // Si no hay stream original, usar latino como fallback para directStreamUrl
            if (!data.original?.streamUrl && !directStreamUrl) {
              logger.log('🔄 [UNIFIED-API] Usando stream latino como fallback para directStreamUrl');
              setDirectStreamUrl(data.latino.streamUrl);
            }
            
            // Detener polling si estaba activo
            if (pollingInterval) {
              clearInterval(pollingInterval);
              pollingInterval = null;
              isPolling = false;
            }
          } else if (data.latino?.scraping) {
            // Latino está scrapeando, iniciar polling
            logger.log('⏳ [UNIFIED-API] Stream latino scrapeando, iniciando polling...');
            setCustomStreamUrl(null);
            
            if (!isPolling) {
              isPolling = true;
              // Polling cada 5 segundos
              pollingInterval = setInterval(async () => {
                try {
                  logger.log('🔄 [POLLING] Verificando latino...');
                  const pollResponse = await fetch(
                    `/api/custom-stream/check?type=movie&id=${movie.id}`
                  );
                  
                  if (pollResponse.ok) {
                    const pollData = await pollResponse.json();
                    if (pollData.available && pollData.stream?.streamUrl) {
                      logger.log('✅ [POLLING] Stream latino disponible!');
                      setCustomStreamUrl(pollData.stream.streamUrl);
                      
                      // Detener polling
                      if (pollingInterval) {
                        clearInterval(pollingInterval);
                        pollingInterval = null;
                        isPolling = false;
                      }
                    }
                  }
                } catch (err) {
                  logger.log('⚠️ [POLLING] Error:', err);
                }
              }, 5000); // 5 segundos
            }
          } else if (data.latino?.unavailable) {
            logger.log('⚠️ [UNIFIED-API] Stream latino no disponible:', data.latino.reason);
            setCustomStreamUrl(null);
          } else {
            setCustomStreamUrl(null);
          }
        }
      } catch (error) {
        logger.log('⚠️ [UNIFIED-API] Error obteniendo streams:', error);
        setCustomStreamUrl(null);
      }
    };

    fetchStreams(true);
    
    // Cleanup: detener polling al desmontar
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [movie]);
  */

  // Manejar reproducción
  const handlePlay = async () => {
    if (!movie) return;
    
    setVideoHasStarted(false); // Resetear cuando se empieza a reproducir
    setCapturingOnline(true);
    setTorrentError(null);

    // 🚀 1) Intentar Vidlink para Original (RÁPIDO)
    try {
      logger.log(`⚡ [VIDLINK] Obteniendo stream Original para película ${movie.id}`);
      
      const vidlinkStartTime = Date.now();
      const vidlinkRes = await fetch(`/api/vidlink-puppeteer?type=movie&id=${movie.id}`);
      const vidlinkTime = Date.now() - vidlinkStartTime;
      const vidlinkData = await vidlinkRes.json();
      
      logger.log(`📡 [VIDLINK] Respuesta - status: ${vidlinkRes.status}, tiempo: ${vidlinkTime}ms${vidlinkData.cached ? ' [CACHÉ]' : ''}`);
      
      if (vidlinkRes.ok && vidlinkData.streamUrl) {
        // Aplicar resume si existe progreso guardado
        const savedProgress = watchHistory.getProgress('movie', movie.id.toString());
        if (savedProgress && savedProgress.currentTime > 0) {
          playerLogger.log(`⏰ [RESUME] Continuando desde: ${savedProgress.currentTime}s (${savedProgress.progress.toFixed(1)}%)`);
          (window as any).resumeTime = savedProgress.currentTime;
        }
        
        // Configurar stream Original desde Vidlink
        setDirectStreamUrl(vidlinkData.streamUrl);
        
        // Subtítulos de Vidlink
        if (vidlinkData.subtitles && vidlinkData.subtitles.length > 0) {
          logger.log(`📝 [VIDLINK] ${vidlinkData.subtitles.length} subtítulos recibidos`);
          setExternalSubtitles(vidlinkData.subtitles);
        } else {
          setExternalSubtitles([]);
        }
        
        // REPRODUCIR INMEDIATAMENTE
        setIsPlaying(true);
        const newUrl = cleanUrlKeepingWatchParty(movie.id);
        window.history.replaceState({}, '', newUrl);
        playerLogger.log(`🎬 [VIDLINK] Reproduciendo Original (${vidlinkTime}ms)`);
        setCapturingOnline(false);
        
        // 🔄 BACKGROUND: Obtener English Dub y Latino desde Vidify
        (async () => {
          try {
            logger.log(`🌐 [VIDIFY] [BACKGROUND] Obteniendo English Dub y Latino...`);
            
            const vidifyStartTime = Date.now();
            const vidifyRes = await fetch(`/api/streams/vidify-unified?type=movie&id=${movie.id}`);
            const vidifyTime = Date.now() - vidifyStartTime;
            const vidifyData = await vidifyRes.json();
            
            logger.log(`📡 [VIDIFY] [BACKGROUND] Respuesta - status: ${vidifyRes.status}, tiempo: ${vidifyTime}ms`);
            
            if (vidifyRes.ok) {
              if (vidifyData.englishDub?.streamUrl) {
                setEnglishDubStreamUrl(vidifyData.englishDub.streamUrl);
                logger.log(`✅ [VIDIFY] [BACKGROUND] English Dub agregado (${vidifyTime}ms)`);
              }
              
              if (vidifyData.latino?.streamUrl) {
                setCustomStreamUrl(vidifyData.latino.streamUrl);
                logger.log(`✅ [VIDIFY] [BACKGROUND] Latino agregado (${vidifyTime}ms)`);
              }
            }
          } catch (vidifyErr) {
            logger.error('❌ [VIDIFY] [BACKGROUND] Error:', vidifyErr);
          }
        })();
        
        return; // Éxito con Vidlink
      }
    } catch (e: any) {
      logger.warn('⚠️ Error iniciando Vidlink, se intentará GoFile/Torrents:', e);
    } finally {
      setCapturingOnline(false);
    }

    // 2) Fallback a GoFile
    try {
      const files = await getMovieFiles(movie.id);
      if (files && files.length > 0) {
        setDownloadedFiles(files);
        setGoFileUrl(files[0].gofileDirectUrl);
        setIsPlaying(true);
        playerLogger.log(`🎬 [GOFILE] Reproduciendo archivo de GoFile: ${files[0].fileName}`);
        return; // Éxito con GoFile
      }
    } catch (error) {
      logger.error('Error verificando archivos GoFile:', error);
    }

    // 3) Fallback a Torrents
    const releaseYear = movie?.release_date 
      ? new Date(movie.release_date).getFullYear() 
      : undefined;

    setShowTorrents(true);
    setSelectedQuality(null); // Reset quality selection
    if (movie.imdb_id) {
      await searchMovieTorrents(movie.imdb_id);
    } else {
      setTorrentError(`Esta película no tiene IMDb ID disponible. Se intentará buscar usando el título: "${movie?.title}"`);
      await searchMovieTorrents('', movie?.title, releaseYear);
    }
  };

  // Seleccionar calidad
  const handleSelectQuality = (quality: string) => {
    setSelectedQuality(quality);
  };

  // Seleccionar torrent y empezar a reproducir
  const handleSelectTorrent = (magnetUri: string) => {
    setSelectedMagnet(magnetUri);
    setIsPlaying(true);
  };

  // Seleccionar archivo GoFile y empezar a reproducir
  const handleSelectDownloadedFile = (file: any) => {
    setGoFileUrl(file.gofileDirectUrl);
    setIsPlaying(true);
  };

  // Reproducir online capturando M3U8 desde 111movies con Puppeteer
  const handlePlayOnline111movies = async () => {
    if (!movie?.imdb_id) {
      setTorrentError('Esta película no tiene IMDb ID disponible para 111movies');
      return;
    }

    try {
      setCapturingOnline(true);
      setTorrentError(null);

      const res = await fetch(`/api/111movies-puppeteer?type=movie&id=${encodeURIComponent(movie.imdb_id)}`);
      const data = await res.json();

      if (!res.ok) {
        setTorrentError(data?.error || 'No se pudo capturar el stream desde 111movies');
        return;
      }

      const url: string | undefined = data?.streamUrl;
      if (url && /\.m3u8(\?|$)/i.test(url)) {
        setGoFileUrl(url);
        // Aplicar resume si existe progreso guardado
        const savedProgress = movie ? watchHistory.getProgress('movie', movie.id.toString()) : null;
        if (savedProgress && savedProgress.currentTime > 0) {
          playerLogger.log(`⏰ [RESUME] Continuando desde: ${savedProgress.currentTime}s (${savedProgress.progress.toFixed(1)}%)`);
          (window as any).resumeTime = savedProgress.currentTime;
        }
        setIsPlaying(true);
        // Limpiar parámetros de URL para evitar loops
        if (movie) {
          const newUrl = cleanUrlKeepingWatchParty(movie.id);
          window.history.replaceState({}, '', newUrl);
        }
        playerLogger.log(`🎬 [111MOVIES] Reproduciendo M3U8 capturado: ${url}`);
      } else if (url) {
        // URL encontrada pero no es M3U8 (ej: workers.dev). Mostrar mensaje.
        setTorrentError('Se capturó una URL que no es M3U8 directo. Intentá nuevamente.');
        playerLogger.warn(`⚠️ [111MOVIES] URL capturada no es M3U8: ${url}`);
      } else {
        setTorrentError('No se encontró URL de streaming (.m3u8)');
      }
    } catch (e: any) {
      logger.error('Error capturando 111movies:', e);
      setTorrentError(e?.message || 'Error capturando 111movies');
    } finally {
      setCapturingOnline(false);
    }
  };

  // Generar nombre de película
  const generateMovieName = (): string => {
    if (!movie) return 'Película';
    return `${movie.title} (${getYear(movie.release_date)})`;
  };
  
  // Helper para limpiar URL preservando watchparty
  const cleanUrlKeepingWatchParty = (movieId: number) => {
    if (watchPartyRoomId) {
      return `/movie/${movieId}?watchparty=${watchPartyRoomId}`;
    }
    return `/movie/${movieId}`;
  };

  // Detectar autoplay desde "Continue Watching" o Watch Party con prioridad: 111movies > GoFile > Torrents
  useEffect(() => {
    const autoplay = searchParams.get('autoplay');
    const watchparty = searchParams.get('watchparty');
    // Autoplay si: viene de Continue Watching O es Watch Party y ya tiene username
    const shouldAutoplay = autoplay === 'true' || (watchparty && watchPartyUsername);
    if (shouldAutoplay && movie && !isPlaying) {
      const autoplayMovie = async () => {
        // Obtener progreso guardado para aplicar resume
        const savedProgress = watchHistory.getProgress('movie', movie.id.toString());
        if (savedProgress && savedProgress.currentTime > 0) {
          playerLogger.log(`⏰ [RESUME] Continuando desde: ${savedProgress.currentTime}s (${savedProgress.progress.toFixed(1)}%)`);
          (window as any).resumeTime = savedProgress.currentTime;
        }
        
        // 🚀 PRIORIDAD 1: Intentar Vidlink para Original (RÁPIDO)
        try {
          logger.log(`⚡ [AUTOPLAY] Intentando Vidlink`);
          
          const vidlinkStartTime = Date.now();
          const vidlinkRes = await fetch(`/api/vidlink-puppeteer?type=movie&id=${movie.id}`);
          const vidlinkTime = Date.now() - vidlinkStartTime;
          const vidlinkData = await vidlinkRes.json();
          
          logger.log(`📡 [AUTOPLAY] Vidlink - status: ${vidlinkRes.status}, tiempo: ${vidlinkTime}ms${vidlinkData.cached ? ' [CACHÉ]' : ''}`);
          
          if (vidlinkRes.ok && vidlinkData.streamUrl) {
            // Configurar stream Original desde Vidlink
            setDirectStreamUrl(vidlinkData.streamUrl);
            
            // Subtítulos de Vidlink
            if (vidlinkData.subtitles && vidlinkData.subtitles.length > 0) {
              logger.log(`📝 [AUTOPLAY] ${vidlinkData.subtitles.length} subtítulos de Vidlink`);
              setExternalSubtitles(vidlinkData.subtitles);
            } else {
              setExternalSubtitles([]);
            }
            
            // REPRODUCIR INMEDIATAMENTE
            setIsPlaying(true);
            playerLogger.log(`🎬 [AUTOPLAY] Vidlink Original (${vidlinkTime}ms)`);
            const newUrl = cleanUrlKeepingWatchParty(movie.id);
            window.history.replaceState({}, '', newUrl);
            
            // 🔄 BACKGROUND: Obtener English Dub y Latino desde Vidify
            (async () => {
              try {
                logger.log(`🌐 [AUTOPLAY] [BACKGROUND] Obteniendo English Dub y Latino desde Vidify...`);
                
                const vidifyStartTime = Date.now();
                const vidifyRes = await fetch(`/api/streams/vidify-unified?type=movie&id=${movie.id}`);
                const vidifyTime = Date.now() - vidifyStartTime;
                const vidifyData = await vidifyRes.json();
                
                logger.log(`📡 [AUTOPLAY] [BACKGROUND] Vidify - status: ${vidifyRes.status}, tiempo: ${vidifyTime}ms`);
                
                if (vidifyRes.ok) {
                  if (vidifyData.englishDub?.streamUrl) {
                    setEnglishDubStreamUrl(vidifyData.englishDub.streamUrl);
                    logger.log(`✅ [AUTOPLAY] [BACKGROUND] English Dub agregado (${vidifyTime}ms)`);
                  }
                  
                  if (vidifyData.latino?.streamUrl) {
                    setCustomStreamUrl(vidifyData.latino.streamUrl);
                    logger.log(`✅ [AUTOPLAY] [BACKGROUND] Latino agregado (${vidifyTime}ms)`);
                  }
                }
              } catch (vidifyErr) {
                logger.error('❌ [AUTOPLAY] [BACKGROUND] Error con Vidify:', vidifyErr);
              }
            })();
            
            return; // Éxito con Vidlink
          }
        } catch (e) {
          logger.warn('⚠️ [AUTOPLAY] Error con Vidify, intentando GoFile:', e);
        }
        
        // PRIORIDAD 2: Verificar si hay archivos GoFile disponibles
        try {
          const files = await getMovieFiles(movie.id);
          if (files.length > 0) {
            setDownloadedFiles(files);
            setSelectedDownloadedFile(files[0]);
            await updateLastAccessed(files[0].id);
            setIsPlaying(true);
            playerLogger.log(`🎬 [AUTOPLAY] GoFile: ${files[0].fileName}`);
            const newUrl = cleanUrlKeepingWatchParty(movie.id);
            window.history.replaceState({}, '', newUrl);
            return; // Éxito con GoFile
          }
        } catch (error) {
          logger.error('Error verificando archivos GoFile:', error);
        }
        
        // PRIORIDAD 3: Fallback a torrents
        setShowTorrents(true);
      };
      
      autoplayMovie();
    }
  }, [searchParams, movie, isPlaying, watchPartyUsername]);

  useEffect(() => {
    const fetchMovieData = async () => {
      try {
        setLoading(true);

        // Fetch all data in parallel for faster loading
        const [movieResponse, creditsResponse, imagesResponse, similarResponse] = await Promise.all([
          fetch(`/api/movie/${params.id}`),
          fetch(`/api/movie/${params.id}/credits`),
          fetch(`/api/movie/${params.id}/images`),
          fetch(`/api/movie/${params.id}/recommendations`)
        ]);

        // Process movie details
        if (!movieResponse.ok) throw new Error('Error al cargar la película');
        const movieData = await movieResponse.json();
        setMovie(movieData);
        
        // Actualizar título de la página para SEO
        document.title = `${movieData.title || movieData.original_title} - CineParaTodos`;

        // Verificar si tiene progreso guardado
        const progress = watchHistory.getProgress('movie', movieData.id.toString());
        setHasProgress(!!progress && progress.progress > 1 && progress.progress < 95);

        // Process cast
        if (creditsResponse.ok) {
          const creditsData = await creditsResponse.json();
          setCast(creditsData.cast.slice(0, 10)); // Top 10 actores
        }

        // Process images (logos)
        if (imagesResponse.ok) {
          const imagesData = await imagesResponse.json();
          setImages(imagesData);
        }

        // Process recomendaciones (ML-based, mejor que similar)
        if (similarResponse.ok) {
          const similarData = await similarResponse.json();
          setSimilarMovies(similarData.results.slice(0, 10)); // Top 10
        }

        // ✅ Fetch downloaded files en background (NO bloquear)
        if (movieData.imdb_id) {
          getMovieFiles(movieData.id).catch(err => {
            logger.warn('Error cargando archivos descargados (no crítico):', err);
          });
        }
      } catch (err) {
        setError('Error al cargar los detalles de la película');
        logger.error('Error fetching movie:', err);
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchMovieData();
    }
  }, [params.id]);

  // Verificar si está en la watchlist
  useEffect(() => {
    if (movie) {
      setInWatchlist(isInWatchlist(movie.id, 'movie'));
    }

    // Escuchar cambios en la watchlist
    const handleWatchlistUpdate = () => {
      if (movie) {
        setInWatchlist(isInWatchlist(movie.id, 'movie'));
      }
    };

    window.addEventListener('watchlistUpdated', handleWatchlistUpdate);
    return () => window.removeEventListener('watchlistUpdated', handleWatchlistUpdate);
  }, [movie]);

  // Handler para agregar/quitar de la lista
  const handleToggleWatchlist = () => {
    if (!movie) return;

    toggleWatchlist({
      id: movie.id,
      type: 'movie',
      title: movie.title,
      poster_path: movie.poster_path,
      backdrop_path: movie.backdrop_path,
      vote_average: movie.vote_average,
      release_date: movie.release_date
    });
  };

  // Actualizar URL cuando empieza a reproducir para que F5 mantenga la película
  useEffect(() => {
    if (isPlaying && movie) {
      const watchUrl = `/watch?type=movie&id=${movie.id}${watchPartyRoomId ? `&watchparty=${watchPartyRoomId}` : ''}`;
      // Usar replaceState para no agregar al historial del navegador
      window.history.replaceState({}, '', watchUrl);
      logger.log(`🔗 [URL] Actualizada a: ${watchUrl}`);
    }
  }, [isPlaying, movie, watchPartyRoomId]);

  if (loading) {
    return <DetailPageSkeleton />;
  }

  if (error || !movie) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error || 'Película no encontrada'}</p>
          <button
            onClick={() => router.back()}
            className="text-white hover:text-gray-300 underline"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Buscar logo original (en inglés o sin idioma)
  const logo = images?.logos?.find((l) => l.iso_639_1 === 'en' || l.iso_639_1 === null) || images?.logos?.[0];

  const movieItem = {
    ...movie,
    media_type: 'movie' as const,
  };

  // Si está reproduciendo, mostrar fullscreen player
  if (isPlaying && (selectedMagnet || goFileUrl || directStreamUrl)) {
    return (
      <div className="fixed inset-0 bg-black z-[100] overflow-hidden">{/* Botón Volver ahora integrado en el reproductor */}
        <div className="absolute inset-0">
          <StreamingPlayer
            magnetUri={selectedMagnet || undefined}
            goFileUrl={goFileUrl || undefined}
            directStreamUrl={directStreamUrl || undefined}
            customStreamUrl={customStreamUrl || undefined}
            englishDubStreamUrl={englishDubStreamUrl || undefined}
            externalSubtitles={externalSubtitles}
            watchPartyRoomId={watchPartyRoomId || undefined}
            watchPartyUsername={watchPartyUsername || undefined}
            movieMetadata={{
              tmdbId: movie.id, // ✅ Mantener tmdbId como número para que se guarde correctamente en la base de datos
              title: `${movie.title} (${getYear(movie.release_date)})`,
              imdbId: movie.imdb_id || undefined,
              backdropPath: movie.backdrop_path ? getImageUrl(movie.backdrop_path, 'original') : undefined,
              logoPath: getOriginalLogo(images),
              year: movie.release_date ? new Date(movie.release_date).getFullYear() : undefined,
              rating: movie.vote_average,
              overview: movie.overview,
            }}
            isModalPlayer={true}
            onClose={() => {
              // Cerrar el reproductor sin navegar
              setIsPlaying(false);
              setSelectedMagnet(null);
              setGoFileUrl(null);
              setDirectStreamUrl(null);
              setVideoHasStarted(false);
            }}
            onError={(error) => {
              setTorrentError(error);
              setIsPlaying(false);
            }}
            onTimeUpdate={(time) => {
              // Marcar que el video ha empezado cuando pasa 0.1s
              if (time > 0.1 && !videoHasStarted) {
                setVideoHasStarted(true);
              }
            }}
          />
        </div>
        
        {/* Overlay que permanece visible hasta que el video empiece */}
        {!videoHasStarted && (
          <div className="fixed inset-0 bg-black z-[150] overflow-hidden pointer-events-none">
            {/* Backdrop */}
            {movie.backdrop_path && (
              <div className="absolute inset-0">
                <Image
                  src={getImageUrl(movie.backdrop_path, 'original')}
                  alt={movie.title}
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
              </div>
            )}

            {/* Contenido centrado */}
            <div className="relative z-10 flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-6">
                {getOriginalLogo(images) && (
                  <div className="max-w-xs w-full px-8">
                    <img
                      src={getOriginalLogo(images)!}
                      alt={movie.title}
                      className="w-full h-auto"
                    />
                  </div>
                )}
                <div className="flex items-center justify-center">
                  <LoadingSpinner />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Overlay de carga mientras se intenta capturar 111movies (solo mostrar mientras busca)
  if (capturingOnline && movie) {
    return (
      <div className="fixed inset-0 bg-black z-[100] overflow-hidden">
        {/* Backdrop */}
        {movie.backdrop_path && (
          <div className="absolute inset-0">
            <Image
              src={getImageUrl(movie.backdrop_path, 'original')}
              alt={movie.title}
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          </div>
        )}

        {/* Contenido centrado */}
        <div className="relative z-10 flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-6">
            {getOriginalLogo(images) && (
              <div className="max-w-xs w-full px-8">
                <img
                  src={getOriginalLogo(images)!}
                  alt={movie.title}
                  className="w-full h-auto"
                />
              </div>
            )}
            <div className="flex items-center justify-center">
              <LoadingSpinner />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Vista de torrents con backdrop
  if (showTorrents && torrents.length > 0 && !isPlaying) {
    return (
      <>
        <Header />
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black">
          {/* Backdrop - misma estructura que la vista principal */}
          <div className="relative min-h-[80vh] mt-24">
            {movie.backdrop_path && (
              <>
                <div className="absolute inset-0">
                  <Image
                    src={getImageUrl(movie.backdrop_path, 'original')}
                    alt={movie.title}
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
                {/* Gradients */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
              </>
            )}
          </div>

          {/* Content */}
          <div className="relative z-10 -mt-[80vh]">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-6xl">
            {/* Botón volver */}
            <button
              onClick={() => {
                if (selectedQuality) {
                  setSelectedQuality(null); // Volver a selección de calidad
                } else {
                  setShowTorrents(false); // Cerrar completamente
                  setTorrentError(null);
                }
              }}
              className="mb-8 bg-black/60 hover:bg-black/80 text-white px-6 py-3 rounded-full transition-all duration-200 flex items-center gap-2 backdrop-blur-sm"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              <span className="font-medium">Volver</span>
            </button>

            {torrentError && (
              <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 flex items-center gap-3 backdrop-blur-sm">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{torrentError}</span>
              </div>
            )}

            {/* Paso 1: Seleccionar Calidad */}
            {!selectedQuality && (
              <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="text-center mb-12">
                  <h2 className="text-5xl font-bold text-white mb-4 drop-shadow-lg">
                    Seleccionar Calidad
                  </h2>
                  <p className="text-xl text-gray-300 drop-shadow-md">
                    {movie.title}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl">
                  {/* GoFile archives first */}
                  {downloadedFiles.map((file, index) => (
                    <button
                      key={`gofile-${index}`}
                      onClick={() => handleSelectDownloadedFile(file)}
                      className="group relative bg-black/40 backdrop-blur-md hover:bg-black/60 rounded-2xl p-8 transition-all duration-300 border-2 border-white/10 hover:border-white/30 hover:scale-105 hover:shadow-2xl"
                    >
                      {/* Badge de calidad con gradiente */}
                      <div className="mb-6">
                        <span className={`
                          inline-block px-6 py-3 rounded-xl font-bold text-3xl tracking-wide
                          ${file.quality?.includes('2160p') || file.quality?.includes('4K') 
                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/50' 
                            : file.quality?.includes('1080p')
                            ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/50'
                            : file.quality?.includes('720p')
                            ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg shadow-green-500/50'
                            : 'bg-gray-700 text-gray-300 shadow-lg'
                          }
                        `}>
                          {file.quality || 'HD'}
                        </span>
                      </div>

                      {/* Movie name instead of filename */}
                      <div className="mb-4">
                        <h3 className="text-white font-semibold text-lg text-center">
                          {generateMovieName()}
                        </h3>
                      </div>

                      {/* Info */}
                      <div className="space-y-3 text-gray-300">
                        <div className="flex items-center justify-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <span className="font-medium">{file.size}</span>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-xs bg-blue-600/30 text-blue-300 px-2 py-1 rounded-md font-medium">
                            GoFile
                          </span>
                        </div>
                      </div>

                      {/* Play icon */}
                      <div className="mt-6 flex justify-center">
                        <PlayIcon className="w-8 h-8 text-white/60 group-hover:text-white group-hover:scale-110 transition-all" />
                      </div>
                    </button>
                  ))}

                  {/* Torrent qualities */}
                  {availableQualities.map((quality) => {
                    const qualityTorrents = torrentsByQuality[quality];
                    const bestTorrent = qualityTorrents[0]; // Ya están ordenados por seeds
                    
                    return (
                      <button
                        key={quality}
                        onClick={() => handleSelectQuality(quality)}
                        className="group relative bg-black/40 backdrop-blur-md hover:bg-black/60 rounded-2xl p-8 transition-all duration-300 border-2 border-white/10 hover:border-white/30 hover:scale-105 hover:shadow-2xl"
                      >
                        {/* Badge de calidad con gradiente */}
                        <div className="mb-6">
                          <span className={`
                            inline-block px-6 py-3 rounded-xl font-bold text-3xl tracking-wide
                            ${quality.includes('2160p') || quality.includes('4K') 
                              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/50' 
                              : quality.includes('1080p')
                              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/50'
                              : quality.includes('720p')
                              ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg shadow-green-500/50'
                              : 'bg-gray-700 text-gray-300 shadow-lg'
                            }
                          `}>
                            {quality}
                          </span>
                        </div>

                        {/* Info */}
                        <div className="space-y-3 text-gray-300">
                          <div className="flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <span className="font-medium">{qualityTorrents.length} {qualityTorrents.length === 1 ? 'opción' : 'opciones'}</span>
                          </div>
                          {bestTorrent.seeds !== undefined && (
                            <div className="flex items-center justify-center gap-2">
                              <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                              </svg>
                              <span className="text-sm">Hasta {bestTorrent.seeds} seeds</span>
                            </div>
                          )}
                        </div>

                        {/* Flecha */}
                        <div className="mt-6 flex justify-center">
                          <svg className="w-8 h-8 text-white/60 group-hover:text-white group-hover:translate-x-2 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Paso 2: Seleccionar Torrent específico */}
            {selectedQuality && (
              <div>
                <div className="mb-8 text-center">
                  <h2 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">
                    {selectedQuality}
                  </h2>
                  <p className="text-lg text-gray-300 drop-shadow-md">
                    Ordenado por mejor conexión ({torrentsByQuality[selectedQuality].length} {torrentsByQuality[selectedQuality].length === 1 ? 'opción' : 'opciones'})
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-12">
                  {torrentsByQuality[selectedQuality].map((torrent, index) => {
                    const seedCount = torrent.seeds || 0;
                    const isHealthy = seedCount > 50;
                    const isGood = seedCount > 10;
                    
                    return (
                      <button
                        key={index}
                        onClick={() => handleSelectTorrent(torrent.magnetUri)}
                        className="group relative bg-black/40 backdrop-blur-md hover:bg-black/60 rounded-xl p-6 text-left transition-all duration-300 border border-white/10 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/20 hover:scale-[1.02]"
                      >
                        {/* Badge de ranking */}
                        {index < 3 && (
                          <div className="absolute top-3 left-3">
                            <div className={`
                              w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                              ${index === 0 ? 'bg-yellow-500 text-black' : index === 1 ? 'bg-gray-400 text-black' : 'bg-orange-600 text-white'}
                            `}>
                              {index + 1}
                            </div>
                          </div>
                        )}

                        {/* Título */}
                        <div className="mb-4 pl-12">
                          <h3 className="text-white font-semibold text-lg line-clamp-2 group-hover:text-blue-400 transition-colors">
                            {torrent.title}
                          </h3>
                        </div>

                        {/* Info grid */}
                        <div className="grid grid-cols-2 gap-3">
                          {torrent.size && (
                            <div className="flex items-center gap-2 text-gray-300">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                              <span className="text-sm font-medium">{torrent.size}</span>
                            </div>
                          )}
                          
                          {torrent.seeds !== undefined && (
                            <div className="flex items-center gap-2">
                              <div className={`
                                flex items-center gap-1.5 px-2 py-1 rounded-md
                                ${isHealthy 
                                  ? 'bg-green-500/30 text-green-300' 
                                  : isGood 
                                  ? 'bg-yellow-500/30 text-yellow-300'
                                  : 'bg-red-500/30 text-red-300'
                                }
                              `}>
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                                </svg>
                                <span className="text-xs font-bold">{seedCount}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Source badge */}
                        {torrent.source && (
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-xs text-gray-400 uppercase tracking-wider">
                              {torrent.source}
                            </span>
                            <svg className="w-5 h-5 text-gray-500 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Modal para ingresar username en Watch Party */}
      {showUsernameModal && watchPartyRoomId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000]">
          <div className="bg-gray-900 p-8 rounded-xl max-w-md w-full mx-4 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-4">Únete a Watch Party</h2>
            <p className="text-gray-400 mb-6">Ingresa tu nombre para unirte a la sala</p>
            <input
              type="text"
              placeholder="Tu nombre"
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  const username = e.currentTarget.value.trim();
                  setWatchPartyUsername(username);
                  setShowUsernameModal(false);
                  localStorage.setItem('watchparty-username', username);
                }
              }}
              autoFocus
            />
            <button
              onClick={() => {
                const input = document.querySelector<HTMLInputElement>('input[placeholder="Tu nombre"]');
                if (input && input.value.trim()) {
                  const username = input.value.trim();
                  setWatchPartyUsername(username);
                  setShowUsernameModal(false);
                  localStorage.setItem('watchparty-username', username);
                }
              }}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-medium transition-colors"
            >
              Unirse
            </button>
          </div>
        </div>
      )}
      
      {/* Hero Section estilo Netflix */}
      <DetailHeroSection
        backdropPath={movie.backdrop_path}
        title={movie.title}
        logo={logo}
        imdbId={movie.imdb_id || undefined}
        tmdbId={movie.id}
        type="movie"
        onMuteStateChange={(show, muted, toggle) => {
          setShowMuteButton(show);
          setPreviewIsMuted(muted);
          setTogglePreviewMute(() => toggle);
        }}
      >
        <>
            {/* Watch Party Badge */}
            {watchPartyRoomId && watchPartyUsername && (
              <div className="mb-6 inline-flex items-center gap-2 bg-purple-600/90 backdrop-blur-sm px-4 py-2 rounded-full border border-purple-400/50">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-white font-medium">Watch Party activo - Sala: {watchPartyRoomId}</span>
              </div>
            )}

            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-4 text-white/90 text-lg mb-6 drop-shadow-lg">
              {movie.adult && (
                <span className="px-2 py-1 border border-white/50 text-sm font-semibold">18+</span>
              )}
              {movie.runtime && (
                <div className="flex items-center gap-2">
                  <ClockIcon className="w-5 h-5" />
                  <span>{formatRuntime(movie.runtime)}</span>
                </div>
              )}
              {movie.release_date && (
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  <span>{getYear(movie.release_date)}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <StarIcon className="w-5 h-5 text-yellow-400" />
                <span>{formatRating(movie.vote_average)}</span>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex flex-wrap gap-4 mb-8">
              <button
                onClick={handlePlay}
                disabled={!movie.imdb_id || loadingTorrents}
                className="inline-flex items-center px-8 py-4 bg-white hover:bg-gray-200 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold rounded transition-colors duration-200 text-lg drop-shadow-xl"
              >
                <PlayIcon className="w-6 h-6 mr-2" />
                {loadingTorrents || capturingOnline ? 'Cargando...' : (hasProgress ? 'Resumir' : 'Ver ahora')}
              </button>

              <button
                onClick={handleToggleWatchlist}
                className={`inline-flex items-center px-8 py-4 font-bold rounded transition-all duration-200 text-lg drop-shadow-xl ${
                  inWatchlist 
                    ? 'bg-white/20 hover:bg-white/30 text-white border-2 border-white' 
                    : 'bg-white/10 hover:bg-white/20 text-white border-2 border-white/50'
                }`}
              >
                {inWatchlist ? (
                  <>
                    <CheckIcon className="w-6 h-6 mr-2" />
                    En mi lista
                  </>
                ) : (
                  <>
                    <BookmarkIcon className="w-6 h-6 mr-2" />
                    Mi lista
                  </>
                )}
              </button>

              {/* Botón de Mute - Solo aparece cuando el preview está activo */}
              {showMuteButton && (
                <button
                  onClick={() => togglePreviewMute && togglePreviewMute()}
                  className="inline-flex items-center justify-center w-16 h-16 font-bold rounded transition-all duration-200 text-lg drop-shadow-xl bg-white/10 hover:bg-white/20 text-white border-2 border-white/50"
                  title={previewIsMuted ? 'Activar sonido' : 'Silenciar'}
                >
                  {previewIsMuted ? (
                    <SpeakerXMarkIcon className="w-6 h-6" />
                  ) : (
                    <SpeakerWaveIcon className="w-6 h-6" />
                  )}
                </button>
              )}
            </div>
          </>

        {/* Overview */}
        <div className="mb-8">
          <p className="text-white text-lg leading-relaxed max-w-2xl drop-shadow-lg">
            {movie.overview || 'Sin sinopsis disponible.'}
          </p>
        </div>

        {/* Genres */}
        {movie.genres && movie.genres.length > 0 && (
          <div className="flex flex-wrap gap-2 text-white/70 drop-shadow-lg">
            {movie.genres.map((genre, index) => (
              <span key={genre.id}>
                {genre.name}
                {index < movie.genres.length - 1 && <span className="ml-2">•</span>}
              </span>
            ))}
          </div>
        )}
      </DetailHeroSection>

      {/* Tabs Section */}
      <div className="bg-black/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setActiveTab('recomendaciones')}
              className={`px-6 py-4 font-semibold transition-colors ${
                activeTab === 'recomendaciones'
                  ? 'text-white border-b-2 border-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Quizá también te guste
            </button>
            <button
              onClick={() => setActiveTab('detalles')}
              className={`px-6 py-4 font-semibold transition-colors ${
                activeTab === 'detalles'
                  ? 'text-white border-b-2 border-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Información
            </button>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="bg-black/50 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Tab: Recomendaciones */}
          {activeTab === 'recomendaciones' && (
            <div className="relative">
              {similarMovies.length > 0 ? (
                <>
                  {/* Botón Anterior */}
                  <button
                    onClick={() => scrollCarousel('left')}
                    className="absolute -left-16 top-1/2 -translate-y-1/2 z-10 text-white transition-all duration-200 hover:scale-125"
                    aria-label="Anterior"
                  >
                    <ChevronLeftIcon className="w-10 h-10" />
                  </button>

                  {/* Carrusel */}
                  <div
                    ref={carouselRef}
                    className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-4"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {similarMovies.map((similarMovie) => (
                      <Link
                        key={similarMovie.id}
                        href={`/movie/${similarMovie.id}`}
                        className="group flex-shrink-0 w-[200px]"
                      >
                        {/* Poster */}
                        <div className="relative aspect-[2/3] bg-gray-800 rounded-lg overflow-hidden mb-2">
                          {similarMovie.poster_path ? (
                            <Image
                              src={getImageUrl(similarMovie.poster_path, 'w500')}
                              alt={similarMovie.title}
                              fill
                              className="object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500">
                              Sin imagen
                            </div>
                          )}
                          
                          {/* Overlay con rating */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="absolute bottom-2 left-2 flex items-center gap-1">
                              <StarIcon className="w-4 h-4 text-yellow-400" />
                              <span className="text-white text-sm font-semibold">
                                {formatRating(similarMovie.vote_average)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Título */}
                        <div className="text-white font-medium text-sm line-clamp-2 group-hover:text-gray-300 transition-colors">
                          {similarMovie.title}
                        </div>
                        {similarMovie.release_date && (
                          <div className="text-gray-400 text-xs mt-1">
                            {getYear(similarMovie.release_date)}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>

                  {/* Botón Siguiente */}
                  <button
                    onClick={() => scrollCarousel('right')}
                    className="absolute -right-16 top-1/2 -translate-y-1/2 z-10 text-white transition-all duration-200 hover:scale-125"
                    aria-label="Siguiente"
                  >
                    <ChevronRightIcon className="w-10 h-10" />
                  </button>
                </>
              ) : (
                <div className="text-center text-gray-400 py-12">
                  No hay recomendaciones disponibles
                </div>
              )}
            </div>
          )}
                
          {/* Tab: Detalles */}
          {activeTab === 'detalles' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {/* Cast */}
              {cast.length > 0 && (
                  <div>
                  <h3 className="text-2xl font-semibold text-white mb-6">Reparto</h3>
                  <div className="space-y-4">
                    {cast.map((actor) => (
                      <div key={actor.id} className="flex items-center gap-4">
                        {actor.profile_path && (
                          <div className="relative w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
                            <Image
                              src={getImageUrl(actor.profile_path, 'w342')}
                              alt={actor.name}
                              fill
                              className="object-cover"
                            />
                  </div>
                )}
                        <div>
                          <div className="text-white font-medium">{actor.name}</div>
                          <div className="text-gray-400 text-sm">{actor.character}</div>
              </div>
            </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Información Técnica */}
              <div>
                <h3 className="text-2xl font-semibold text-white mb-6">Información</h3>
                <div className="space-y-4">
                  {/* Géneros */}
                  {movie.genres && movie.genres.length > 0 && (
                <div>
                      <h4 className="text-gray-400 text-sm mb-1">Géneros</h4>
                      <p className="text-white">
                        {movie.genres.map((g) => g.name).join(', ')}
                      </p>
                </div>
                  )}

                  {/* Estado */}
            <div>
                    <h4 className="text-gray-400 text-sm mb-1">Estado</h4>
                    <p className="text-white">{movie.status}</p>
                  </div>

                  {/* Idioma Original */}
                  <div>
                    <h4 className="text-gray-400 text-sm mb-1">Idioma Original</h4>
                    <p className="text-white uppercase">{movie.original_language}</p>
                  </div>

                  {/* Presupuesto */}
                  {movie.budget > 0 && (
                    <div>
                      <h4 className="text-gray-400 text-sm mb-1">Presupuesto</h4>
                      <p className="text-white">${movie.budget.toLocaleString()}</p>
                    </div>
                  )}

                  {/* Recaudación */}
                  {movie.revenue > 0 && (
                    <div>
                      <h4 className="text-gray-400 text-sm mb-1">Recaudación</h4>
                      <p className="text-white">${movie.revenue.toLocaleString()}</p>
                    </div>
                  )}

                  {/* Productoras */}
                  {movie.production_companies && movie.production_companies.length > 0 && (
                    <div>
                      <h4 className="text-gray-400 text-sm mb-1">Productoras</h4>
                      <p className="text-white">
                        {movie.production_companies.slice(0, 3).map((c) => c.name).join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
