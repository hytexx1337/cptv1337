'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { StarIcon, CalendarIcon, TvIcon, PlayIcon, ArrowLeftIcon, ArrowDownTrayIcon, BookmarkIcon, CheckIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid';
import LoadingSpinner from '@/components/LoadingSpinner';
import DetailPageSkeleton from '@/components/DetailPageSkeleton';
import { TVShowDetails, Cast, TMDBImages, TVShowExternalIds, Season } from '@/types/tmdb';
import { getImageUrl, formatRating, getYear } from '@/lib/tmdb';
import { useTorrentSearch } from '@/hooks/useTorrentSearch';
import { useDownloadedFiles, DownloadedFile } from '@/hooks/useDownloadedFiles';
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

type TabView = 'episodios' | 'detalles';

// Cache de IMDb IDs
const imdbCache = new Map<string, string>();

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

export default function TVShowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tvShow, setTVShow] = useState<TVShowDetails | null>(null);
  
  // Ref para trackear si ya se ejecutó autoplay para esta combinación watchparty+season+episode
  const autoplayExecutedRef = useRef<string | null>(null);
  const [cast, setCast] = useState<Cast[]>([]);
  const [images, setImages] = useState<TMDBImages | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para episodios
  const [activeTab, setActiveTab] = useState<TabView>('episodios');
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonData, setSeasonData] = useState<Season | null>(null);
  const [loadingSeasonData, setLoadingSeasonData] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  
  // Estados para streaming
  const [imdbId, setImdbId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedMagnet, setSelectedMagnet] = useState<string | null>(null);
  const [torrentError, setTorrentError] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string | null>(null);
  // Captura online desde 111movies y URL directa
  const [capturingOnline, setCapturingOnline] = useState<boolean>(false);
  const [videoHasStarted, setVideoHasStarted] = useState(false);
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
    if (watchPartyRoomId && !watchPartyUsername) {
      setShowUsernameModal(true);
    }
  }, [watchPartyRoomId, watchPartyUsername]);
  
  // Helper para limpiar URL preservando watchparty y season/episode
  const cleanUrlKeepingWatchParty = (tvId: number) => {
    if (watchPartyRoomId) {
      // Incluir season y episode si están en la URL
      const urlSeason = searchParams.get('season');
      const urlEpisode = searchParams.get('episode');
      let url = `/tv/${tvId}?watchparty=${watchPartyRoomId}`;
      if (urlSeason && urlEpisode) {
        url += `&season=${urlSeason}&episode=${urlEpisode}`;
      }
      return url;
    }
    return `/tv/${tvId}`;
  };
  
  const [goFileUrl, setGoFileUrl] = useState<string | null>(null);
  const [directStreamUrl, setDirectStreamUrl] = useState<string | null>(null);
  const [externalSubtitles, setExternalSubtitles] = useState<Array<{ url: string; language: string; label: string }>>([]);
  const [customStreamUrl, setCustomStreamUrl] = useState<string | null>(null); // Stream personalizado (español latino)
  const [englishDubStreamUrl, setEnglishDubStreamUrl] = useState<string | null>(null); // Stream en inglés doblado
  
  // Estados para archivos descargados de GoFile
  const [downloadedFiles, setDownloadedFiles] = useState<DownloadedFile[]>([]);
  const [selectedDownloadedFile, setSelectedDownloadedFile] = useState<DownloadedFile | null>(null);
  const [loadingDownloadedFiles, setLoadingDownloadedFiles] = useState(false);
  
  const { searchSeriesTorrents, torrents, isLoading: loadingTorrents } = useTorrentSearch({
    onError: (error) => setTorrentError(error),
  });

  // Hook para archivos descargados
  const { 
    getEpisodeFiles, 
    preloadNextEpisodes,
    preloadSeason,
    updateLastAccessed 
  } = useDownloadedFiles({
    onError: (error) => setTorrentError(error),
  });

  // Función para generar el nombre de serie y episodio
  const generateEpisodeName = (episodeNumber: number): string => {
    if (!tvShow || !seasonData) return `Episodio ${episodeNumber}`;
    
    const episode = seasonData.episodes.find(ep => ep.episode_number === episodeNumber);
    const seriesName = tvShow.name || tvShow.original_name || 'Serie';
    const seasonNumber = selectedSeason.toString().padStart(2, '0');
    const episodeNum = episodeNumber.toString().padStart(2, '0');
    
    return `${seriesName} - S${seasonNumber}E${episodeNum}`;
  };

  // 🎯 Sistema unificado de streams (Vidlink + Cuevana)
  const fetchStreamsExecutedRef = useRef<string | null>(null);
  
  // ⚠️ DESHABILITADO: Ahora usamos Vidify directamente en handlePlayEpisode y autoplay
  // Este useEffect llamaba a la API vieja /api/streams/unified que no existe más
  /*
  useEffect(() => {
    if (!tvShow || !selectedSeason || !selectedEpisode) return;
    
    const episodeKey = `${tvShow.id}-S${selectedSeason}E${selectedEpisode}`;
    
    // Si ya se ejecutó fetchStreams para este episodio, salir
    if (fetchStreamsExecutedRef.current === episodeKey) {
      logger.log(`⏭️ [FETCH-STREAMS] Ya se ejecutó para ${episodeKey}, saliendo`);
      return;
    }
    
    // Marcar como ejecutado
    fetchStreamsExecutedRef.current = episodeKey;
    logger.log(`🎯 [FETCH-STREAMS] Marcando como ejecutado: ${episodeKey}`);
    
    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let isPolling = false;
    
    const fetchStreams = async (quick = true) => {
      try {
        const quickParam = quick ? '&quick=true' : '';
        logger.log(`🔍 [UNIFIED-API] Obteniendo streams para ${episodeKey}${quick ? ' (modo rápido)' : ''}`);
        
        const response = await fetch(
          `/api/streams/unified?type=tv&id=${tvShow.id}&season=${selectedSeason}&episode=${selectedEpisode}${quickParam}`
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
                    `/api/custom-stream/check?type=tv&id=${tvShow.id}&season=${selectedSeason}&episode=${selectedEpisode}`
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
  }, [tvShow, selectedSeason, selectedEpisode]);
  */

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

  // Fetch IMDb ID
  const fetchIMDbId = async () => {
    if (!tvShow) return;

    const cacheKey = `tv-${tvShow.id}`;
    if (imdbCache.has(cacheKey)) {
      setImdbId(imdbCache.get(cacheKey)!);
      return;
    }

    try {
      const response = await fetch(`/api/tv/${tvShow.id}/external_ids`);
      if (response.ok) {
        const externalIds: TVShowExternalIds = await response.json();
        if (externalIds.imdb_id) {
          setImdbId(externalIds.imdb_id);
          imdbCache.set(cacheKey, externalIds.imdb_id);
        }
      }
    } catch (error) {
      logger.error('Error fetching IMDb ID:', error);
    }
  };

  // Fetch datos de temporada
  const fetchSeasonData = async (season: number) => {
    if (!tvShow) return;

    setLoadingSeasonData(true);
    try {
      const response = await fetch(`/api/tv/${tvShow.id}/season/${season}`);
      if (response.ok) {
        const data: Season = await response.json();
        setSeasonData(data);
        
        // 🚀 PRELOAD: Precargar archivos GoFile para toda la temporada en segundo plano
        preloadSeason(tvShow.id, season)
          .catch(error => logger.warn('⚠️ [PRELOAD] Error precargando temporada:', error));
      }
    } catch (error) {
      logger.error('Error fetching season data:', error);
    } finally {
      setLoadingSeasonData(false);
    }
  };


  // Manejar reproducción de episodio
  const handlePlayEpisode = async (episodeNumber: number) => {
    if (!tvShow) {
      setTorrentError('No se encontraron datos de la serie');
      return;
    }

    // SIMPLE: Navegar a /watch y dejar que ClientPlayer se encargue de todo
    logger.log(`▶️ [TV-PAGE] Navegando a /watch para S${selectedSeason}E${episodeNumber}`);
    router.push(`/watch?type=tv&id=${tvShow.id}&season=${selectedSeason}&episode=${episodeNumber}${watchPartyRoomId ? `&watchparty=${watchPartyRoomId}` : ''}${watchPartyUsername ? `&username=${watchPartyUsername}` : ''}`);
    
    /* CÓDIGO VIEJO ELIMINADO - Ahora usamos API unificada en ClientPlayer
    setSelectedEpisode(episodeNumber);
    setSelectedQuality(null);
    setVideoHasStarted(false); // Resetear cuando se cambia de episodio

    // 🚀 NUEVA ESTRATEGIA OPTIMIZADA:
    // 1. Original → Vidlink (RÁPIDO ~300ms con caché)
    // 2. English Dub + Latino → Vidify (background)
    */
  };

  // Función para obtener archivos descargados del episodio específico
  const fetchDownloadedFiles = async (episodeNumber: number) => {
    if (!tvShow?.id) return;
    
    setLoadingDownloadedFiles(true);
    try {
      const files = await getEpisodeFiles(tvShow.id, selectedSeason, episodeNumber);
      setDownloadedFiles(files);
      logger.log(`📁 [DOWNLOADED] Archivos encontrados para S${selectedSeason}E${episodeNumber}:`, files.length);
    } catch (error) {
      logger.error('Error obteniendo archivos descargados:', error);
      setDownloadedFiles([]);
    } finally {
      setLoadingDownloadedFiles(false);
    }
  };

  // Función para reproducir archivo descargado de GoFile
  const handleSelectDownloadedFile = async (file: DownloadedFile) => {
    try {
      // Actualizar último acceso
      await updateLastAccessed(file.id);
      
      // Obtener progreso guardado para este episodio
      if (tvShow && selectedEpisode) {
        const savedProgress = watchHistory.getProgress('tv', tvShow.id.toString(), selectedSeason, selectedEpisode);
        
        // Guardar el tiempo de inicio para el reproductor
        if (savedProgress && savedProgress.currentTime > 0) {
          playerLogger.log(`⏰ [RESUME] Continuando desde: ${savedProgress.currentTime}s (${savedProgress.progress.toFixed(1)}%)`);
          // Pasar el tiempo de inicio al reproductor a través de un estado global o prop
          (window as any).resumeTime = savedProgress.currentTime;
        }
      }
      
      // Establecer archivo seleccionado y cambiar a modo reproducción
      setSelectedDownloadedFile(file);
      setIsPlaying(true);
      
      playerLogger.log(`🎬 [DOWNLOADED] Reproduciendo archivo de GoFile: ${file.fileName}`);
    } catch (error) {
      logger.error('Error al seleccionar archivo descargado:', error);
      setTorrentError('Error al reproducir archivo descargado');
    }
  };

  // Seleccionar calidad
  const handleSelectQuality = (quality: string) => {
    setSelectedQuality(quality);
  };

  // Seleccionar torrent y empezar a reproducir
  const handleSelectTorrent = (magnetUri: string) => {
    // Obtener progreso guardado para este episodio
    if (tvShow && selectedEpisode) {
      const savedProgress = watchHistory.getProgress('tv', tvShow.id.toString(), selectedSeason, selectedEpisode);
      
      // Guardar el tiempo de inicio para el reproductor
      if (savedProgress && savedProgress.currentTime > 0) {
        playerLogger.log(`⏰ [RESUME] Continuando desde: ${savedProgress.currentTime}s (${savedProgress.progress.toFixed(1)}%)`);
        // Pasar el tiempo de inicio al reproductor a través de un estado global o prop
        (window as any).resumeTime = savedProgress.currentTime;
      }
    }
    
    setSelectedMagnet(magnetUri);
    setIsPlaying(true);
  };

  const handleDownloadTorrent = (magnetUri: string, title: string) => {
    // Crear un enlace temporal para descargar el magnet
    const link = document.createElement('a');
    link.href = magnetUri;
    link.download = `${title}.magnet`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Detectar parámetros de temporada y episodio desde "Continue Watching" o Watch Party
  useEffect(() => {
    const seasonParam = searchParams.get('season');
    const episodeParam = searchParams.get('episode');
    const watchparty = searchParams.get('watchparty');
    
    console.log('🔍 [AUTOPLAY-DEBUG] useEffect ejecutado:', {
      seasonParam,
      episodeParam,
      watchparty,
      watchPartyUsername,
      tvShow: !!tvShow,
      isPlaying
    });
    
    // Si es Watch Party, esperar a que haya username antes de autoplay
    if (watchparty && !watchPartyUsername) {
      console.log('⏸️ [AUTOPLAY] Esperando username para Watch Party...');
      return;
    }
    
    // Esperar a que haya imdbId antes de hacer autoplay (necesario para 111movies/vidlink/etc)
    if (!imdbId) {
      console.log('⏸️ [AUTOPLAY] Esperando imdbId...');
      return;
    }
    
    if (tvShow && seasonParam && episodeParam) {
      // Si no hay watchparty, usar el comportamiento original (no autoplay si ya está playing)
      if (!watchparty && isPlaying) {
        console.log('⏭️ [AUTOPLAY] Ya está reproduciendo, saliendo');
        return;
      }
      const season = parseInt(seasonParam);
      const episode = parseInt(episodeParam);
      
      // Crear clave única para esta combinación
      const autoplayKey = `${watchparty || 'normal'}-${season}-${episode}`;
      
      // Si ya se ejecutó autoplay para esta combinación, salir
      if (autoplayExecutedRef.current === autoplayKey) {
        console.log('⏭️ [AUTOPLAY] Ya se ejecutó autoplay para esta combinación, saliendo');
        return;
      }
      
      // Marcar como ejecutado
      autoplayExecutedRef.current = autoplayKey;
      console.log('✅ [AUTOPLAY-DEBUG] Marcando autoplay como ejecutado para:', autoplayKey);
      
      if (season !== selectedSeason) {
        setSelectedSeason(season);
        // Intentar usar datos que ya están en tvShow.seasons
        const seasonFromTvShow = tvShow.seasons?.find(s => s.season_number === season);
        if (seasonFromTvShow && seasonFromTvShow.episodes && seasonFromTvShow.episodes.length > 0) {
          logger.info(`✅ Using season ${season} data from tvShow.seasons: ${seasonFromTvShow.episodes.length} episodes`);
          setSeasonData(seasonFromTvShow as Season);
        } else {
          logger.info(`🔄 Fetching season ${season} data from API`);
          fetchSeasonData(season);
        }
      }
      
      // Autoplay con la misma prioridad: Vidify > GoFile > Torrents
      const autoplayEpisode = async () => {
        console.log('🎬 [AUTOPLAY-DEBUG] autoplayEpisode iniciado para S' + season + 'E' + episode);
        setSelectedEpisode(episode);
        
        // Obtener progreso guardado para aplicar resume
        const savedProgress = watchHistory.getProgress('tv', tvShow.id.toString(), season, episode);
        if (savedProgress && savedProgress.currentTime > 0) {
          playerLogger.log(`⏰ [RESUME] Continuando desde: ${savedProgress.currentTime}s (${savedProgress.progress.toFixed(1)}%)`);
          (window as any).resumeTime = savedProgress.currentTime;
        }
        
        // 🚀 1) Intentar hls-browser-proxy para Original (RÁPIDO, usa Vidlink internamente)
          try {
          console.log(`⚡ [AUTOPLAY-DEBUG] Iniciando hls-browser-proxy para S${season}E${episode}...`);
          logger.log(`⚡ [AUTOPLAY] Intentando hls-browser-proxy: S${season}E${episode}`);
          
          const proxyStartTime = Date.now();
          const proxyRes = await fetch(`/api/hls-browser-proxy/start?type=tv&id=${tvShow.id}&season=${season}&episode=${episode}`);
          const proxyTime = Date.now() - proxyStartTime;
          const proxyData = await proxyRes.json();
          
          console.log('🔍 [AUTOPLAY-DEBUG] hls-browser-proxy respuesta:', { ok: proxyRes.ok, hasPlaylist: !!proxyData.playlistUrl, cached: proxyData.cached, time: proxyTime, source: proxyData.source });
          logger.log(`📡 [AUTOPLAY] hls-browser-proxy - status: ${proxyRes.status}, tiempo: ${proxyTime}ms${proxyData.cached ? ' [CACHÉ]' : ''} [${proxyData.source}]`);
          
          if (proxyRes.ok && proxyData.playlistUrl) {
            // Configurar stream Original
            setDirectStreamUrl(proxyData.playlistUrl);
              
            // Subtítulos (ya vienen proxificados)
            if (proxyData.subtitles && proxyData.subtitles.length > 0) {
              logger.log(`📝 [AUTOPLAY] ${proxyData.subtitles.length} subtítulos de ${proxyData.source}`);
              setExternalSubtitles(proxyData.subtitles);
              } else {
                setExternalSubtitles([]);
              }
              
            // REPRODUCIR INMEDIATAMENTE
              setIsPlaying(true);
            playerLogger.log(`🎬 [AUTOPLAY] hls-browser-proxy Original S${season}E${episode} (${proxyTime}ms)`);
              
              // Limpiar los parámetros de URL
              const newUrl = cleanUrlKeepingWatchParty(tvShow.id);
              window.history.replaceState({}, '', newUrl);
            
            // 🔄 BACKGROUND: Obtener English Dub y Latino desde Vidify
            (async () => {
              try {
                logger.log(`🌐 [AUTOPLAY] [BACKGROUND] Obteniendo English Dub y Latino desde Vidify...`);
                
                const vidifyStartTime = Date.now();
                const vidifyRes = await fetch(`/api/streams/vidify-unified?type=tv&id=${tvShow.id}&season=${season}&episode=${episode}`);
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
        } catch (error) {
          logger.error('Error al intentar Vidlink:', error);
        }
        
        // 2) Verificar si hay archivos GoFile disponibles
        try {
          const files = await getEpisodeFiles(tvShow.id, season, episode);
          if (files.length > 0) {
            setDownloadedFiles(files);
            setSelectedDownloadedFile(files[0]);
            await updateLastAccessed(files[0].id);
            setIsPlaying(true);
            playerLogger.log(`🎬 [AUTOPLAY] GoFile S${season}E${episode}: ${files[0].fileName}`);
            
            // Limpiar los parámetros de URL
            const newUrl = cleanUrlKeepingWatchParty(tvShow.id);
            window.history.replaceState({}, '', newUrl);
            return; // Éxito con GoFile
          }
        } catch (error) {
          logger.error('Error verificando archivos GoFile:', error);
        }
        
        // 3) Fallback: buscar torrents
        await handlePlayEpisode(episode);
        
        // Limpiar los parámetros de URL
        const newUrl = cleanUrlKeepingWatchParty(tvShow.id);
        window.history.replaceState({}, '', newUrl);
      };
      
      autoplayEpisode();
    }
  }, [searchParams, tvShow, isPlaying, selectedSeason, watchPartyUsername, imdbId]);

  useEffect(() => {
    const fetchTVShowData = async () => {
      try {
        setLoading(true);

        // Fetch all data in parallel for faster loading
        const [tvResponse, creditsResponse, imagesResponse] = await Promise.all([
          fetch(`/api/tv/${params.id}`),
          fetch(`/api/tv/${params.id}/credits`),
          fetch(`/api/tv/${params.id}/images`)
        ]);

        // Process TV show details
        if (!tvResponse.ok) throw new Error('Error al cargar la serie');
        const tvData = await tvResponse.json();
        setTVShow(tvData);
        
        // Actualizar título de la página para SEO (se actualizará con temporada/episodio después)
        document.title = `${tvData.name || tvData.original_name} - CineParaTodos`;

        // Process cast
        if (creditsResponse.ok) {
          const creditsData = await creditsResponse.json();
          setCast(creditsData.cast.slice(0, 10));
        }

        // Process images (logos)
        if (imagesResponse.ok) {
          const imagesData = await imagesResponse.json();
          setImages(imagesData);
        }
      } catch (err) {
        setError('Error al cargar los detalles de la serie');
        logger.error('Error fetching TV show:', err);
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchTVShowData();
    }
  }, [params.id]);

  // Verificar si está en la watchlist
  useEffect(() => {
    if (tvShow) {
      setInWatchlist(isInWatchlist(tvShow.id, 'tv'));
    }

    // Escuchar cambios en la watchlist
    const handleWatchlistUpdate = () => {
      if (tvShow) {
        setInWatchlist(isInWatchlist(tvShow.id, 'tv'));
      }
    };

    window.addEventListener('watchlistUpdated', handleWatchlistUpdate);
    return () => window.removeEventListener('watchlistUpdated', handleWatchlistUpdate);
  }, [tvShow]);

  // Handler para agregar/quitar de la lista
  const handleToggleWatchlist = () => {
    if (!tvShow) return;

    toggleWatchlist({
      id: tvShow.id,
      type: 'tv',
      title: tvShow.name,
      poster_path: tvShow.poster_path,
      backdrop_path: tvShow.backdrop_path,
      vote_average: tvShow.vote_average,
      first_air_date: tvShow.first_air_date
    });
  };

  // Fetch IMDb ID cuando tengamos tvShow (si no viene en los datos)
  useEffect(() => {
    if (tvShow && !imdbId && !tvShow.external_ids?.imdb_id) {
      fetchIMDbId();
    } else if (tvShow?.external_ids?.imdb_id && !imdbId) {
      // Si ya viene en los datos, usarlo directamente
      setImdbId(tvShow.external_ids.imdb_id);
    }
  }, [tvShow]);

  // Usar datos de temporada que ya vienen en tvShow.seasons o fetch si no están
  useEffect(() => {
    if (tvShow && !seasonData) {
      const season1 = tvShow.seasons?.find(s => s.season_number === 1);
      if (season1 && season1.episodes && season1.episodes.length > 0) {
        // Ya tenemos los datos de la temporada 1 con episodios
        logger.info(`✅ Using season data from tvShow.seasons: ${season1.episodes.length} episodes`);
        setSeasonData(season1 as Season);
        // Precargar archivos GoFile para toda la temporada
        preloadSeason(tvShow.id, 1)
          .catch(error => logger.warn('⚠️ [PRELOAD] Error precargando temporada:', error));
      } else {
        // No hay datos de episodios, hacer fetch
        logger.info('🔄 Fetching season 1 data from API');
        fetchSeasonData(1);
      }
    }
  }, [tvShow]);

  // Actualizar título de la página cuando cambian temporada/episodio
  useEffect(() => {
    if (tvShow && selectedSeason && selectedEpisode) {
      document.title = `${tvShow.name || tvShow.original_name} - T${selectedSeason} E${selectedEpisode} - CineParaTodos`;
    } else if (tvShow) {
      document.title = `${tvShow.name || tvShow.original_name} - CineParaTodos`;
    }
  }, [tvShow, selectedSeason, selectedEpisode]);

  // Actualizar URL cuando empieza a reproducir para que F5 mantenga el episodio
  useEffect(() => {
    if (isPlaying && tvShow && selectedSeason && selectedEpisode) {
      const watchUrl = `/watch?type=tv&id=${tvShow.id}&season=${selectedSeason}&episode=${selectedEpisode}${watchPartyRoomId ? `&watchparty=${watchPartyRoomId}` : ''}`;
      // Usar replaceState para no agregar al historial del navegador
      window.history.replaceState({}, '', watchUrl);
      logger.log(`🔗 [URL] Actualizada a: ${watchUrl}`);
    }
  }, [isPlaying, tvShow, selectedSeason, selectedEpisode, watchPartyRoomId]);


  if (loading) {
    return <DetailPageSkeleton />;
  }

  if (error || !tvShow) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error || 'Serie no encontrada'}</p>
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

  const tvShowItem = {
    ...tvShow,
    media_type: 'tv' as const,
  };

  // Si está reproduciendo, mostrar fullscreen player
  if (isPlaying && (selectedMagnet || selectedDownloadedFile || goFileUrl || directStreamUrl) && selectedEpisode) {
    // Determinar si hay siguiente episodio disponible
    const hasNextEpisode = (() => {
      if (!seasonData) return false;
      
      // Buscar siguiente episodio en la temporada actual
      const currentEpisodeIndex = seasonData.episodes.findIndex(ep => ep.episode_number === selectedEpisode);
      if (currentEpisodeIndex !== -1 && currentEpisodeIndex < seasonData.episodes.length - 1) {
        return true; // Hay un episodio siguiente en esta temporada
      }
      
      // Verificar si hay una siguiente temporada
      const currentSeasonObj = tvShow.seasons?.find((s: { season_number: number }) => s.season_number === selectedSeason);
      if (currentSeasonObj) {
        const nextSeason = tvShow.seasons?.find((s: { season_number: number; episode_count?: number }) => s.season_number === selectedSeason + 1);
        return !!nextSeason && (nextSeason.episode_count ?? 0) > 0;
      }
      
      return false;
    })();

    logger.log('🔍 [NEXT-EPISODE-CHECK] hasNextEpisode:', hasNextEpisode, 'seasonData:', !!seasonData, 'selectedSeason:', selectedSeason, 'selectedEpisode:', selectedEpisode);

    // Calcular datos del siguiente episodio para el Next Up overlay
    const nextEpisodeData = (() => {
      if (!seasonData || !hasNextEpisode) return undefined;
      
      // Buscar siguiente episodio en la temporada actual
      const currentEpisodeIndex = seasonData.episodes.findIndex(ep => ep.episode_number === selectedEpisode);
      if (currentEpisodeIndex !== -1 && currentEpisodeIndex < seasonData.episodes.length - 1) {
        const nextEp = seasonData.episodes[currentEpisodeIndex + 1];
        return {
          season: selectedSeason,
          episode: nextEp.episode_number,
          title: nextEp.name,
          stillPath: nextEp.still_path ? `https://image.tmdb.org/t/p/w500${nextEp.still_path}` : undefined,
        };
      }
      
      // Si no hay más episodios en esta temporada, siguiente temporada episodio 1
      return {
        season: selectedSeason + 1,
        episode: 1,
        title: `Temporada ${selectedSeason + 1} - Episodio 1`,
        stillPath: undefined,
      };
    })();

    // Obtener la sinopsis del episodio específico
    const currentEpisodeData = seasonData?.episodes.find(ep => ep.episode_number === selectedEpisode);
    const episodeOverview = currentEpisodeData?.overview || tvShow.overview; // Fallback a la sinopsis de la serie si no hay del episodio

    return (
      <div className="fixed inset-0 bg-black z-[100] overflow-hidden">{/* Botón Volver ahora integrado en el reproductor */}
        <div className="absolute inset-0">
          <StreamingPlayer
            magnetUri={selectedMagnet || undefined}
            goFileUrl={goFileUrl || selectedDownloadedFile?.gofileDirectUrl}
            directStreamUrl={directStreamUrl || undefined}
            customStreamUrl={customStreamUrl || undefined}
            englishDubStreamUrl={englishDubStreamUrl || undefined}
            externalSubtitles={externalSubtitles}
            watchPartyRoomId={watchPartyRoomId || undefined}
            watchPartyUsername={watchPartyUsername || undefined}
            hasNextEpisode={hasNextEpisode}
            nextEpisodeData={nextEpisodeData}
            movieMetadata={{
              tmdbId: tvShow.id, // ✅ Mantener tmdbId como número para que se guarde correctamente en la base de datos
              title: `${tvShow.name} S${selectedSeason}E${selectedEpisode}`,
              imdbId: imdbId || undefined,
              season: selectedSeason,
              episode: selectedEpisode,
              episodeTitle: currentEpisodeData?.name || undefined, // Título del episodio para el overlay
              backdropPath: tvShow.backdrop_path ? getImageUrl(tvShow.backdrop_path, 'original') : undefined,
              logoPath: getOriginalLogo(images),
              year: tvShow.first_air_date ? new Date(tvShow.first_air_date).getFullYear() : undefined,
              rating: tvShow.vote_average,
              overview: episodeOverview, // Usar la sinopsis del episodio específico
            }}
            tvMetadata={{
              tmdbId: tvShow.id,
              title: tvShow.name,
              season: selectedSeason,
              episode: selectedEpisode,
            }}
            isModalPlayer={true}
            onClose={() => {
              // Cerrar el reproductor sin navegar
              setIsPlaying(false);
              setSelectedMagnet(null);
              setGoFileUrl(null);
              setDirectStreamUrl(null);
              setSelectedDownloadedFile(null);
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
            onEpisodeSelect={(season, episode, episodeData) => {
              logger.log(`⏭️ [TV-PAGE] [EPISODE-SELECT] Navegando a S${season}E${episode}`);
              
              // SIMPLE: Navegar a /watch y dejar que ClientPlayer se encargue de todo
              router.push(`/watch?type=tv&id=${tvShow.id}&season=${season}&episode=${episode}`);
            }}
          />
        </div>
        
        {/* Overlay que permanece visible hasta que el video empiece */}
        {!videoHasStarted && (
          <div className="fixed inset-0 bg-black z-[150] overflow-hidden pointer-events-none">
            {/* Backdrop */}
            {tvShow.backdrop_path && (
              <div className="absolute inset-0">
                <Image
                  src={getImageUrl(tvShow.backdrop_path, 'original')}
                  alt={tvShow.name}
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
                      alt={tvShow.name}
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
  if (capturingOnline && tvShow) {
    return (
      <div className="fixed inset-0 bg-black z-[100] overflow-hidden">
        {/* Backdrop */}
        {tvShow.backdrop_path && (
          <div className="absolute inset-0">
            <Image
              src={getImageUrl(tvShow.backdrop_path, 'original')}
              alt={tvShow.name}
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
                  alt={tvShow.name}
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
  if (torrents.length > 0 && selectedEpisode && !isPlaying) {
    return (
      <>
        <Header />
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black">
          {/* Backdrop - misma estructura que la vista principal */}
          <div className="relative min-h-[80vh] mt-24">
            {tvShow.backdrop_path && (
              <>
                <div className="absolute inset-0">
                  <Image
                    src={getImageUrl(tvShow.backdrop_path, 'original')}
                    alt={tvShow.name}
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
                  setSelectedEpisode(null); // Cerrar completamente
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
              <div>
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                  <div className="text-center mb-12">
                    <h2 className="text-5xl font-bold text-white mb-4 drop-shadow-lg">
                      Seleccionar Calidad
                    </h2>
                    <p className="text-xl text-gray-300 drop-shadow-md">
                      {tvShow.name} - Temporada {selectedSeason} Episodio {selectedEpisode}
                    </p>
                  </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl">
                  {/* Archivos GoFile descargados - aparecen primero */}
                   {downloadedFiles.map((file) => (
                     <button
                       key={`gofile-${file.id}`}
                       onClick={() => handleSelectDownloadedFile(file)}
                       className="group relative bg-gradient-to-br from-green-600/20 to-emerald-600/20 backdrop-blur-md hover:from-green-600/30 hover:to-emerald-600/30 rounded-2xl p-6 transition-all duration-300 border-2 border-green-500/30 hover:border-green-400/50 hover:scale-105 hover:shadow-2xl hover:shadow-green-500/20"
                     >
                       {/* Badge de calidad */}
                       <div className="mb-4 text-center">
                         <span className="inline-block px-4 py-2 rounded-xl font-bold text-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg shadow-green-500/50">
                           {file.quality}
                         </span>
                       </div>

                       {/* Info del archivo */}
                       <div className="space-y-2 text-gray-300 text-center">
                         <div className="text-sm font-medium text-white truncate">
                           {selectedEpisode ? generateEpisodeName(selectedEpisode) : file.fileName}
                         </div>
                         <div className="text-xs text-gray-400">
                           {file.size}
                         </div>
                         <div className="flex items-center justify-center gap-2 text-xs">
                           <span className="bg-green-600/20 text-green-400 px-2 py-1 rounded">
                             GoFile
                           </span>
                         </div>
                       </div>

                       {/* Icono de play */}
                       <div className="mt-4 flex justify-center">
                         <PlayIcon className="w-8 h-8 text-green-400 group-hover:text-green-300 group-hover:scale-110 transition-all" />
                       </div>
                     </button>
                   ))}

                  {/* Torrents por calidad */}
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
                      <div
                        key={index}
                        className="group relative bg-black/40 backdrop-blur-md rounded-xl p-6 text-left transition-all duration-300 border border-white/10 hover:border-white/30 hover:shadow-lg hover:shadow-white/10"
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

                        {/* Botones de acción */}
                        <div className="absolute top-3 right-3 flex gap-2">
                          {/* Botón de descarga */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadTorrent(torrent.magnetUri, torrent.title);
                            }}
                            className="bg-green-600/80 hover:bg-green-600 text-white p-2 rounded-lg transition-all duration-200 hover:scale-110"
                            title="Descargar torrent"
                          >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                          </button>
                          
                          {/* Botón de reproducir */}
                          <button
                            onClick={() => handleSelectTorrent(torrent.magnetUri)}
                            className="bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg transition-all duration-200 hover:scale-110 border border-white/20"
                            title="Reproducir"
                          >
                            <PlayIcon className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Título */}
                        <div className="mb-4 pl-12 pr-20">
                          <h3 className="text-white font-semibold text-lg line-clamp-2">
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
                          </div>
                        )}
                      </div>
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
        backdropPath={tvShow.backdrop_path}
        title={tvShow.name}
        logo={logo}
        imdbId={imdbId || undefined}
        tmdbId={tvShow.id}
        type="tv"
        season={1}
        episode={1}
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
              {tvShow.adult && (
                <span className="px-2 py-1 border border-white/50 text-sm font-semibold">18+</span>
              )}
              {tvShow.episode_run_time && tvShow.episode_run_time.length > 0 && (
                <span>{tvShow.episode_run_time[0]} min</span>
              )}
              {tvShow.first_air_date && (
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  <span>{getYear(tvShow.first_air_date)}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <TvIcon className="w-5 h-5" />
                <span>{tvShow.number_of_seasons} temporada{tvShow.number_of_seasons !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <StarIcon className="w-5 h-5 text-yellow-400" />
                <span>{formatRating(tvShow.vote_average)}</span>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex flex-wrap gap-4 mb-8">
              <button
                onClick={() => seasonData?.episodes?.[0] && handlePlayEpisode(1)}
                disabled={!seasonData || !imdbId}
                className="inline-flex items-center px-8 py-4 bg-white hover:bg-gray-200 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold rounded transition-colors duration-200 text-lg drop-shadow-xl"
              >
                <PlayIcon className="w-6 h-6 mr-2" />
                Reproducir
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
            {tvShow.overview || 'Sin sinopsis disponible.'}
          </p>
        </div>

        {/* Genres */}
        {tvShow.genres && tvShow.genres.length > 0 && (
          <div className="flex flex-wrap gap-2 text-white/70 drop-shadow-lg">
            {tvShow.genres.map((genre, index) => (
              <span key={genre.id}>
                {genre.name}
                {index < tvShow.genres.length - 1 && <span className="ml-2">•</span>}
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
              onClick={() => setActiveTab('episodios')}
              className={`px-6 py-4 font-semibold transition-colors ${
                activeTab === 'episodios'
                  ? 'text-white border-b-2 border-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Episodios
            </button>
            <button
              onClick={() => setActiveTab('detalles')}
              className={`px-6 py-4 font-semibold transition-colors ${
                activeTab === 'detalles'
                  ? 'text-white border-b-2 border-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Detalles
            </button>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="bg-black/50 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Tab: Episodios */}
          {activeTab === 'episodios' && (
            <div className="space-y-8">
              {/* Selector de temporada MEJORADO - HORIZONTAL + Info */}
              <div className="space-y-4 bg-gray-900/50 backdrop-blur-sm rounded-xl p-6">
                {/* Header con info */}
                {seasonData && (
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-white">Episodios</h3>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-2 text-gray-300">
                        <TvIcon className="w-5 h-5 text-gray-400" />
                        <span><strong className="text-white">{seasonData.episodes.length}</strong> episodios</span>
                      </div>
                      {seasonData.air_date && (
                        <div className="flex items-center gap-2 text-gray-300">
                          <CalendarIcon className="w-5 h-5 text-gray-400" />
                          <span>{new Date(seasonData.air_date).getFullYear()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Selector HORIZONTAL con scroll */}
                <div className="relative">
                  <label className="block text-sm text-gray-400 mb-3">Temporada</label>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                    {tvShow.seasons?.filter(s => s.season_number > 0).map((seasonObj) => {
                      const season = seasonObj.season_number;
                      return (
                      <button
                        key={season}
                        onClick={() => {
                          setSelectedSeason(season);
                          // Intentar usar datos que ya están en tvShow.seasons
                          const seasonFromTvShow = tvShow.seasons?.find(s => s.season_number === season);
                          if (seasonFromTvShow && seasonFromTvShow.episodes && seasonFromTvShow.episodes.length > 0) {
                            logger.info(`✅ Using season ${season} data from tvShow.seasons: ${seasonFromTvShow.episodes.length} episodes`);
                            setSeasonData(seasonFromTvShow as Season);
                          } else {
                            logger.info(`🔄 Fetching season ${season} data from API`);
                            fetchSeasonData(season);
                          }
                        }}
                        className={`flex-shrink-0 px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
                          selectedSeason === season
                            ? 'bg-white text-black shadow-lg'
                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700'
                        }`}
                      >
                        Temporada {season}
                      </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Grid de episodios MEJORADO - Cards más grandes y elegantes */}
              {loadingSeasonData ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                </div>
              ) : seasonData && seasonData.episodes.length > 0 ? (
                <div className="space-y-4">
                  {seasonData.episodes
                    .filter((episode) => {
                      // Filtrar episodios que aún no se han estrenado
                      if (!episode.air_date) return true;
                      const airDate = new Date(episode.air_date);
                      const today = new Date();
                      return airDate <= today;
                    })
                    .map((episode) => (
                    <button
                      key={episode.id}
                      onClick={() => handlePlayEpisode(episode.episode_number)}
                      disabled={loadingTorrents && selectedEpisode === episode.episode_number}
                      className="group w-full text-left bg-gray-900/30 hover:bg-gray-800/50 rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
                    >
                      <div className="flex flex-col md:flex-row gap-4 p-4">
                        {/* Thumbnail MÁS GRANDE */}
                        <div className="relative w-full md:w-80 aspect-video bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                          {episode.still_path ? (
                            <img
                              src={getImageUrl(episode.still_path, 'w500')}
                              alt={episode.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500">
                              <TvIcon className="w-16 h-16 opacity-20" />
                            </div>
                          )}
                         
                          {/* Watch Progress Indicator */}
                          {(() => {
                            const watchData = watchHistory.getProgress('tv', tvShow.id.toString(), selectedSeason, episode.episode_number);
                            
                            if (watchData && watchData.progress > 0) {
                              const progressPercent = Math.round(watchData.progress);
                              return (
                                <>
                                  {/* Progress Bar */}
                                  <div className="absolute bottom-0 left-0 right-0">
                                    <div className="bg-black/50 h-1.5">
                                      <div 
                                        className="bg-red-600 h-full transition-all duration-300"
                                        style={{ width: `${progressPercent}%` }}
                                      />
                                    </div>
                                  </div>
                                  
                                  {/* Watched Badge */}
                                  {progressPercent >= 90 && (
                                    <div className="absolute top-3 left-3">
                                      <div className="bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5">
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        VISTO
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Progress Percentage */}
                                  {progressPercent < 90 && (
                                    <div className="absolute top-3 right-3">
                                      <div className="bg-black/90 backdrop-blur-sm text-white text-sm font-bold px-3 py-1.5 rounded-md">
                                        {progressPercent}%
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            }
                            return null;
                          })()}

                          {/* Play overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-2">
                            {loadingTorrents && selectedEpisode === episode.episode_number ? (
                              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white"></div>
                            ) : (
                              <>
                                <div className="transform group-hover:scale-110 transition-transform duration-300">
                                  <PlayIcon className="w-20 h-20 text-white drop-shadow-2xl" />
                                </div>
                                {(() => {
                                  const episodeProgress = watchHistory.getProgress('tv', tvShow.id.toString(), selectedSeason, episode.episode_number);
                                  if (episodeProgress && episodeProgress.progress > 1 && episodeProgress.progress < 95) {
                                    return (
                                      <span className="text-white font-bold text-lg bg-black/70 px-4 py-2 rounded-full drop-shadow-2xl">
                                        Resumir
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Info del episodio */}
                        <div className="flex-1 flex flex-col justify-center min-w-0">
                          {/* Número y título */}
                          <div className="flex items-start gap-3 mb-2">
                            <div className="flex-shrink-0 w-10 h-10 bg-black/60 border border-gray-700 rounded-lg flex items-center justify-center">
                              <span className="text-white font-bold text-lg">{episode.episode_number}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-white font-bold text-lg mb-1 line-clamp-1 group-hover:text-red-400 transition-colors">
                                {episode.name}
                              </h3>
                              <div className="flex items-center gap-3 text-sm text-gray-400">
                                {episode.runtime && (
                                  <span className="flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {formatRuntime(episode.runtime)}
                                  </span>
                                )}
                                {episode.air_date && (
                                  <span>{new Date(episode.air_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Descripción */}
                          {episode.overview && (
                            <p className="text-gray-400 text-sm line-clamp-2 leading-relaxed">
                              {episode.overview}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-12">
                  No hay episodios disponibles para esta temporada
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

              {/* Información */}
              <div>
                <h3 className="text-2xl font-semibold text-white mb-6">Información</h3>
                <div className="space-y-4">
                  {tvShow.genres && tvShow.genres.length > 0 && (
                    <div>
                      <h4 className="text-gray-400 text-sm mb-1">Géneros</h4>
                      <p className="text-white">{tvShow.genres.map((g) => g.name).join(', ')}</p>
                    </div>
                  )}
                  <div>
                    <h4 className="text-gray-400 text-sm mb-1">Temporadas</h4>
                    <p className="text-white">{tvShow.number_of_seasons}</p>
                  </div>
            <div>
                    <h4 className="text-gray-400 text-sm mb-1">Episodios Totales</h4>
                    <p className="text-white">{tvShow.number_of_episodes}</p>
                  </div>
                  <div>
                    <h4 className="text-gray-400 text-sm mb-1">Estado</h4>
                    <p className="text-white">{tvShow.status}</p>
                  </div>
                  {tvShow.created_by && tvShow.created_by.length > 0 && (
                    <div>
                      <h4 className="text-gray-400 text-sm mb-1">Creado por</h4>
                      <p className="text-white">{tvShow.created_by.map((c) => c.name).join(', ')}</p>
                    </div>
                  )}
                  {tvShow.production_companies && tvShow.production_companies.length > 0 && (
                    <div>
                      <h4 className="text-gray-400 text-sm mb-1">Productoras</h4>
                      <p className="text-white">
                        {tvShow.production_companies.slice(0, 3).map((c) => c.name).join(', ')}
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
