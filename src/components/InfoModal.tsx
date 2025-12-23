'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { XMarkIcon, PlayIcon, PlusIcon, HandThumbUpIcon, HandThumbDownIcon, SpeakerWaveIcon, SpeakerXMarkIcon, ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { getImageUrl, getOriginalTitle, getYear, getReleaseDate } from '@/lib/tmdb';
import { MediaItem, Video, MovieDetails, TVShowDetails, Cast, Crew, Creator, Movie, TVShowExternalIds, Season, TMDBImages } from '@/types/tmdb';
import TVSeasonsAndEpisodes from './TVSeasonsAndEpisodes';
import { useVideoPlayer } from '@/hooks/useVideoPlayer';
import VideoPlayer from './streaming/VideoPlayer';
import SubtitleControls from './streaming/SubtitleControls';
import { useTorrentSearch } from '@/hooks/useTorrentSearch';
import { useDownloadedFiles, DownloadedFile } from '@/hooks/useDownloadedFiles';
import { logger, playerLogger, cacheLogger } from '@/lib/logger';
import LoadingSpinner from './LoadingSpinner';

// ⚡ Lazy load del player (reduce bundle inicial)
const StreamingPlayer = dynamic(() => import('./streaming/StreamingPlayer'), {
  loading: () => <LoadingSpinner />,
  ssr: false
});

type ModalView = 'info' | 'episode-selector' | 'torrents' | 'playing';

// Cache de IMDb IDs (persiste durante la sesión)
const imdbCache = new Map<string, string>();

// Helper para obtener el logo original (solo en inglés)
const getOriginalLogo = (images: TMDBImages | null): string | undefined => {
  if (!images?.logos || images.logos.length === 0) return undefined;
  
  // Solo aceptar logos en inglés
  const englishLogo = images.logos.find(logo => logo.iso_639_1 === 'en');
  
  return englishLogo?.file_path ? getImageUrl(englishLogo.file_path, 'original') : undefined;
};

interface InfoModalProps {
  item: MediaItem;
  isOpen: boolean;
  onClose: () => void;
  onMovieSelect?: (movie: Movie) => void;
}

export default function InfoModal({ item, isOpen, onClose, onMovieSelect }: InfoModalProps) {
  const router = useRouter();
  const [details, setDetails] = useState<MovieDetails | TVShowDetails | null>(null);
  const [cast, setCast] = useState<Cast[]>([]);
  const [crew, setCrew] = useState<Crew[]>([]);
  const [images, setImages] = useState<TMDBImages | null>(null);
  const [trailer, setTrailer] = useState<Video | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(50);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Movie[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const videoRef = useRef<HTMLIFrameElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const suggestionsScrollRef = useRef<HTMLDivElement>(null);

  // Estados para el sistema de streaming
  const [modalView, setModalView] = useState<ModalView>('info');
  const [imdbId, setImdbId] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [seasonData, setSeasonData] = useState<Season | null>(null);
  const [loadingSeasonData, setLoadingSeasonData] = useState(false);
  const [selectedMagnet, setSelectedMagnet] = useState<string | null>(null);
  const [selectedDownloadedFile, setSelectedDownloadedFile] = useState<DownloadedFile | null>(null);
  const [torrentError, setTorrentError] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string | null>(null);

  // Hook de búsqueda de torrents
  const { searchMovieTorrents, searchSeriesTorrents, torrents, isLoading: loadingTorrents } = useTorrentSearch({
    onError: (error) => setTorrentError(error),
  });

  // Hook para archivos descargados
  const { 
    downloadedFiles, 
    isLoading: loadingDownloadedFiles, 
    getMovieFiles, 
    getEpisodeFiles, 
    updateLastAccessed 
  } = useDownloadedFiles({
    onError: (error) => setTorrentError(error),
  });

  // VideoJS player para archivos descargados
  const {
    videoRef: downloadedVideoRef,
    playerRef: downloadedPlayerRef,
    playerState: downloadedPlayerState,
    addSubtitle,
    addSubtitleFromUrl,
    togglePlayPause,
    seek,
    setVolume: setPlayerVolume,
    openSubtitleSettings,
    closeSubtitleSettings,
    applySubtitleSettings,
  } = useVideoPlayer({
    streamUrl: selectedDownloadedFile?.gofileDirectUrl || null,
    onError: (error) => {
      logger.error('Error en VideoJS player:', error);
      setTorrentError(error);
      setModalView('torrents');
    },
    onReady: () => {
      playerLogger.log('VideoJS player ready for downloaded file:', selectedDownloadedFile?.fileName);
    },
  });

  const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
  const title = getOriginalTitle(item);
  const year = getYear(getReleaseDate(item));
  const backdropUrl = getImageUrl(item.backdrop_path, 'original');

  // Función para normalizar calidades
  const normalizeQuality = (quality: string | undefined): string | null => {
    if (!quality || quality === 'Unknown') return null;
    
    // Normalizar variaciones comunes
    if (quality.includes('2160') || quality.toUpperCase().includes('4K')) return '4K';
    if (quality.includes('1080')) return '1080p';
    if (quality.includes('720')) return '720p';
    if (quality.includes('480')) return '480p';
    
    return quality;
  };

  // Agrupar torrents por calidad
  const torrentsByQuality = torrents.reduce((acc: Record<string, typeof torrents>, torrent) => {
    const quality = normalizeQuality(torrent.quality) || 'Unknown';
    if (quality !== 'Unknown') {
      if (!acc[quality]) acc[quality] = [];
      acc[quality].push(torrent);
    }
    return acc;
  }, {});

  // Agrupar archivos descargados por calidad
  const downloadedFilesByQuality = downloadedFiles.reduce((acc: Record<string, DownloadedFile[]>, file) => {
    const quality = normalizeQuality(file.quality) || 'Unknown';
    playerLogger.log(`🔍 [DEBUG] Archivo descargado: ${file.torrentTitle} - Calidad original: "${file.quality}" - Normalizada: "${quality}"`);
    if (quality !== 'Unknown') {
      if (!acc[quality]) acc[quality] = [];
      acc[quality].push(file);
    }
    return acc;
  }, {});

  playerLogger.log(`🔍 [DEBUG] Total archivos descargados recibidos:`, downloadedFiles.length);
  playerLogger.log(`🔍 [DEBUG] downloadedFiles array:`, downloadedFiles);

  // Combinar calidades disponibles de torrents y archivos descargados
  const allQualities = new Set([
    ...Object.keys(torrentsByQuality),
    ...Object.keys(downloadedFilesByQuality)
  ]);

  playerLogger.log(`🔍 [DEBUG] Calidades de torrents:`, Object.keys(torrentsByQuality));
  playerLogger.log(`🔍 [DEBUG] Calidades de archivos descargados:`, Object.keys(downloadedFilesByQuality));
  playerLogger.log(`🔍 [DEBUG] Todas las calidades combinadas:`, Array.from(allQualities));

  // Ordenar calidades de mayor a menor
  const qualityOrder: Record<string, number> = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1 };
  const availableQualities = Array.from(allQualities).sort((a, b) => {
    const orderA = qualityOrder[a] || 0;
    const orderB = qualityOrder[b] || 0;
    return orderB - orderA;
  });

  // Fetch datos de temporada (para selector de episodios con miniaturas)
  const fetchSeasonData = async (season: number) => {
    if (!item || mediaType !== 'tv') return;
    
    setLoadingSeasonData(true);
    try {
      const response = await fetch(`/api/tv/${item.id}/season/${season}`);
      if (response.ok) {
        const data: Season = await response.json();
        setSeasonData(data);
        playerLogger.log(`📺 [SEASON] Datos de temporada ${season} cargados:`, data.episodes.length, 'episodios');
      }
    } catch (error) {
      logger.error('Error fetching season data:', error);
    } finally {
      setLoadingSeasonData(false);
    }
  };

  // Manejar click en "Reproducir"
  const handlePlayClick = async () => {
    if (!imdbId) {
      // Si no hay IMDb ID, mostrar mensaje más descriptivo y permitir continuar con título
      if (mediaType === 'tv') {
        const releaseYear = details && 'first_air_date' in details && details.first_air_date 
          ? new Date(details.first_air_date).getFullYear() 
          : undefined;
        
        setTorrentError(`Esta serie no tiene IMDb ID disponible (posiblemente es contenido futuro). Se intentará buscar usando el título: "${title}"`);
        
        // Para series sin IMDb ID: mostrar selector de episodio de todas formas
        setModalView('episode-selector');
        await fetchSeasonData(1);
        return;
      } else {
        setTorrentError(`Esta película no tiene IMDb ID disponible. Se intentará buscar usando el título: "${title}"`);
        
        // Para películas sin IMDb ID: intentar buscar torrents por título
        setSelectedQuality(null);
        setModalView('torrents');
        
        const releaseYear = details && 'release_date' in details && details.release_date 
          ? new Date(details.release_date).getFullYear() 
          : undefined;
        
        // Buscar torrents usando título como fallback
        const [torrentsResult, downloadedResult] = await Promise.allSettled([
          searchMovieTorrents('', title, releaseYear), // IMDb ID vacío, usar título
          getMovieFiles(item.id)
        ]);
        
        if (torrentsResult.status === 'rejected') {
          logger.warn('⚠️ Error buscando torrents:', torrentsResult.reason);
        }
        if (downloadedResult.status === 'rejected') {
          logger.warn('⚠️ Error buscando archivos descargados:', downloadedResult.reason);
        }
        return;
      }
    }

    if (mediaType === 'movie') {
      // Para películas: buscar torrents y archivos descargados, luego mostrar selector de calidad
      setSelectedQuality(null); // Reset quality selection
      setModalView('torrents');
      
      // Buscar torrents y archivos descargados en paralelo
      const [torrentsResult, downloadedResult] = await Promise.allSettled([
        searchMovieTorrents(imdbId),
        getMovieFiles(item.id)
      ]);
      
      if (torrentsResult.status === 'rejected') {
        logger.warn('⚠️ Error buscando torrents:', torrentsResult.reason);
      }
      if (downloadedResult.status === 'rejected') {
        logger.warn('⚠️ Error buscando archivos descargados:', downloadedResult.reason);
      }
    } else {
      // Para series: mostrar selector de episodio
      setModalView('episode-selector');
      // Cargar datos de la primera temporada
      await fetchSeasonData(1);
    }
  };

  // Buscar torrents para serie (después de seleccionar episodio)
  const handleSearchSeriesTorrents = async () => {
    if (!imdbId) {
      // Si no hay IMDb ID, intentar búsqueda por título
      const releaseYear = details && 'first_air_date' in details && details.first_air_date 
        ? new Date(details.first_air_date).getFullYear() 
        : undefined;
      
      setTorrentError(`Buscando torrents para "${title}" S${selectedSeason}E${selectedEpisode} usando título (sin IMDb ID)`);
      
      setModalView('torrents');
      
      // Buscar torrents y archivos descargados usando título como fallback
      const [torrentsResult, downloadedResult] = await Promise.allSettled([
        searchSeriesTorrents(undefined, selectedSeason, selectedEpisode, title, releaseYear), // Sin IMDb ID, usar título
        getEpisodeFiles(item.id, selectedSeason, selectedEpisode)
      ]);
      
      if (torrentsResult.status === 'rejected') {
        logger.warn('⚠️ Error buscando torrents:', torrentsResult.reason);
      }
      if (downloadedResult.status === 'rejected') {
        logger.warn('⚠️ Error buscando archivos descargados:', downloadedResult.reason);
      }
      return;
    }

    setModalView('torrents');
    
    // Buscar torrents y archivos descargados en paralelo
    const [torrentsResult, downloadedResult] = await Promise.allSettled([
      searchSeriesTorrents(imdbId, selectedSeason, selectedEpisode),
      getEpisodeFiles(item.id, selectedSeason, selectedEpisode)
    ]);
    
    if (torrentsResult.status === 'rejected') {
      logger.warn('⚠️ Error buscando torrents:', torrentsResult.reason);
    }
    if (downloadedResult.status === 'rejected') {
      logger.warn('⚠️ Error buscando archivos descargados:', downloadedResult.reason);
    }
  };

  // Seleccionar torrent y empezar reproducción
  const handleSelectTorrent = (magnetUri: string) => {
    setSelectedMagnet(magnetUri);
    setModalView('playing');
  };

  // Seleccionar archivo descargado y empezar reproducción
  const handleSelectDownloadedFile = async (file: DownloadedFile) => {
    // Actualizar último acceso
    await updateLastAccessed(file.id);
    
    // Usar DirectVideoPlayer para archivos descargados
    setSelectedDownloadedFile(file);
    setSelectedMagnet(null); // Limpiar magnet para evitar conflictos
    setModalView('playing');
  };

  // Volver a la vista anterior
  const handleBack = () => {
    if (modalView === 'playing') {
      setModalView('torrents');
      setSelectedMagnet(null);
      setSelectedDownloadedFile(null); // Limpiar archivo descargado seleccionado
    } else if (modalView === 'torrents') {
      if (selectedQuality) {
        setSelectedQuality(null); // Volver a selección de calidad
      } else {
        setModalView('info'); // Volver a info
      }
    } else if (modalView === 'episode-selector') {
      setModalView('info');
    }
  };

  // Fetch IMDb ID (con caching)
  const fetchIMDbId = async () => {
    const cacheKey = `${mediaType}-${item.id}`;
    
    // Verificar cache primero
    const cached = imdbCache.get(cacheKey);
    if (cached) {
      playerLogger.log('🎯 [IMDB] Cache hit:', cached);
      setImdbId(cached);
      return cached;
    }

    try {
      if (mediaType === 'movie') {
        // Para películas, el IMDb ID viene en la respuesta base
        if (details && 'imdb_id' in details && details.imdb_id) {
          playerLogger.log('🎬 [IMDB] Película IMDb ID:', details.imdb_id);
          imdbCache.set(cacheKey, details.imdb_id);
          setImdbId(details.imdb_id);
          return details.imdb_id;
        }
      } else {
        // Para series, necesitamos un fetch adicional
        const externalIdsResponse = await fetch(`/api/tv/${item.id}/external_ids`);
        if (externalIdsResponse.ok) {
          const externalIds: TVShowExternalIds = await externalIdsResponse.json();
          if (externalIds.imdb_id) {
            playerLogger.log('📺 [IMDB] Serie IMDb ID:', externalIds.imdb_id);
            imdbCache.set(cacheKey, externalIds.imdb_id);
            setImdbId(externalIds.imdb_id);
            return externalIds.imdb_id;
          }
        }
      }

      logger.warn('⚠️ [IMDB] No se encontró IMDb ID');
      return null;
    } catch (error) {
      logger.error('❌ [IMDB] Error obteniendo IMDb ID:', error);
      return null;
    }
  };

  // Fetch detailed information (optimized with parallel requests)
  const fetchDetails = async () => {
    if (!item) return;
    
    setIsLoading(true);
    try {
      // Fetch all data in parallel for faster loading
      const [detailsResponse, creditsResponse, imagesResponse, videosResponse] = await Promise.all([
        fetch(`/api/${mediaType}/${item.id}`),
        fetch(`/api/${mediaType}/${item.id}/credits`),
        fetch(`/api/${mediaType}/${item.id}/images`),
        fetch(`/api/${mediaType}/${item.id}/videos`)
      ]);

      // Process details
      if (detailsResponse.ok) {
        const detailsData = await detailsResponse.json();
        setDetails(detailsData);
      }

      // Process credits
      if (creditsResponse.ok) {
        const creditsData = await creditsResponse.json();
        setCast(creditsData.cast?.slice(0, 10) || []); // Top 10 cast members
        setCrew(creditsData.crew || []);
      }

      // Process images
      if (imagesResponse.ok) {
        const imagesData = await imagesResponse.json();
        setImages(imagesData);
      }

      // Process trailer
      if (videosResponse.ok) {
        const videosData = await videosResponse.json();
        const trailerVideo = videosData.results.find((video: Video) => 
          video.type === 'Trailer' && video.site === 'YouTube'
        );
        setTrailer(trailerVideo || null);
      }
    } catch (error) {
      logger.error('Error fetching details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch TMDB recommendations (mejor que similar - usa ML basado en usuarios)
  const fetchSuggestions = async () => {
    if (!item || mediaType !== 'movie') return; // Only for movies
    
    setLoadingSuggestions(true);
    try {
      const suggestionsResponse = await fetch(`/api/movie/${item.id}/recommendations`);
      if (suggestionsResponse.ok) {
        const suggestionsData = await suggestionsResponse.json();
        setSuggestions(suggestionsData.results || []);
      }
    } catch (error) {
      logger.error('Error fetching movie recommendations:', error);
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Load details when modal opens and auto-play trailer
  useEffect(() => {
    if (isOpen && item) {
      fetchDetails();
    }
  }, [isOpen, item]);

  // Fetch IMDb ID after details are loaded
  useEffect(() => {
    if (details && isOpen) {
      fetchIMDbId();
    }
  }, [details, isOpen]);

  // Fetch suggestions after details are loaded
  useEffect(() => {
    if (details && mediaType === 'movie') {
      fetchSuggestions();
    }
  }, [details, mediaType]);

  // Auto-play trailer when it's available
  useEffect(() => {
    if (trailer && isOpen) {
      setShowVideo(true);
    }
  }, [trailer, isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setModalView('info');
      setSelectedMagnet(null);
      setSelectedQuality(null);
      setTorrentError(null);
      setSeasonData(null);
      setImages(null);
    }
  }, [isOpen]);

  // Handle escape key and outside clicks
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
    
    if (videoRef.current && videoRef.current.contentWindow) {
      const command = isMuted ? '{"event":"command","func":"unMute","args":[]}' : '{"event":"command","func":"mute","args":[]}';
      videoRef.current.contentWindow.postMessage(command, 'https://www.youtube-nocookie.com');
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    
    if (videoRef.current && videoRef.current.contentWindow) {
      const command = `{"event":"command","func":"setVolume","args":[${newVolume}]}`;
      videoRef.current.contentWindow.postMessage(command, 'https://www.youtube-nocookie.com');
    }
    
    // Unmute if volume is increased from 0
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
    // Mute if volume is set to 0
    if (newVolume === 0 && !isMuted) {
      setIsMuted(true);
    }
  };

  // Handle movie selection
  const handleMovieClick = (movie: Movie) => {
    if (onMovieSelect) {
      onMovieSelect(movie);
    }
  };

  // Funciones de navegación del carrusel de sugerencias
  const scrollSuggestions = (direction: 'left' | 'right') => {
    if (suggestionsScrollRef.current) {
      const scrollAmount = 300; // Cantidad de píxeles a desplazar
      const newScrollLeft = direction === 'left' 
        ? suggestionsScrollRef.current.scrollLeft - scrollAmount
        : suggestionsScrollRef.current.scrollLeft + scrollAmount;
      
      suggestionsScrollRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      });
    }
  };

  // Manejar click en episodio - buscar torrents y mostrar selector
  const handleEpisodeClick = async (season: number, episode: number) => {
    setSelectedSeason(season);
    setSelectedEpisode(episode);
    setSelectedQuality(null); // Reset quality selection
    
    // Cambiar a vista de torrents
    setModalView('torrents');
    
    // Buscar torrents y archivos descargados en paralelo
    const promises = [];
    
    if (imdbId) {
      promises.push(searchSeriesTorrents(imdbId, season, episode));
    }
    
    // Siempre buscar archivos descargados
    promises.push(getEpisodeFiles(item.id, season, episode));
    
    // Ejecutar ambas búsquedas en paralelo
    const results = await Promise.allSettled(promises);
    
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const type = index === 0 ? 'torrents' : 'archivos descargados';
        logger.warn(`⚠️ Error buscando ${type}:`, result.reason);
      }
    });
  };

  const toggleVideo = () => {
    setShowVideo(!showVideo);
  };

  // Get director for movies or creator for TV shows
  const getDirectorOrCreator = () => {
    if (mediaType === 'movie') {
      const director = crew.find(person => person.job === 'Director');
      return director ? `Dirigida por ${director.name}` : '';
    } else {
      const tvDetails = details as TVShowDetails;
      if (tvDetails?.created_by && tvDetails.created_by.length > 0) {
        return `Creada por ${tvDetails.created_by.map((creator: Creator) => creator.name).join(', ')}`;
      }
    }
    return '';
  };

  // Get runtime or episode info
  const getRuntimeInfo = () => {
    if (mediaType === 'movie') {
      const movieDetails = details as MovieDetails;
      if (movieDetails?.runtime) {
        const hours = Math.floor(movieDetails.runtime / 60);
        const minutes = movieDetails.runtime % 60;
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      }
    } else {
      const tvDetails = details as TVShowDetails;
      if (tvDetails?.number_of_seasons && tvDetails?.number_of_episodes) {
        return `${tvDetails.number_of_seasons} temporada${tvDetails.number_of_seasons > 1 ? 's' : ''} • ${tvDetails.number_of_episodes} episodios`;
      }
    }
    return '';
  };

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 transition-opacity duration-300 ease-out overflow-hidden ${
        modalView === 'playing' 
          ? 'bg-black z-[60]' // Fullscreen negro cuando reproduce (encima del header)
          : 'bg-black/80 backdrop-blur-sm z-50' // Backdrop normal en info/selector
      }`}
    >
      <div className={modalView === 'playing' ? '' : 'flex items-center justify-center min-h-screen p-2 sm:p-4'}>
        <div 
          ref={modalRef}
          className={`bg-black w-full shadow-2xl transform transition-all duration-300 ease-out ${
            modalView === 'playing'
              ? 'h-screen overflow-hidden' // Fullscreen 100% cuando reproduce
              : 'rounded-lg scale-100 animate-modal-enter max-w-xs sm:max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto'
          }`}
        >
          {/* Header with video/image (oculto cuando está reproduciendo) */}
          {modalView !== 'playing' && (
          <div className="relative h-[30vh] sm:h-[40vh] md:h-[45vh] lg:h-[50vh] min-h-[200px] sm:min-h-[250px] md:min-h-[300px]">
            {showVideo && trailer ? (
              <div className="relative w-full h-full bg-black overflow-hidden">
                <iframe
                  ref={videoRef}
                  src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&iv_load_policy=3&modestbranding=1&playsinline=1&enablejsapi=1&vq=hd720&disablekb=1&fs=0&cc_load_policy=0&origin=${window.location.origin}&loop=1&playlist=${trailer.key}`}
                  className="absolute inset-0 w-full h-full rounded-t-lg"
                  allow="autoplay; encrypted-media"
                  allowFullScreen={false}
                  style={{
                    width: '120%',
                    height: '120%',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    minWidth: '120%',
                    minHeight: '120%',
                    pointerEvents: 'none' // Deshabilita la interacción con el iframe
                  }}
                />
                
                {/* Gradiente de fusión en la parte inferior */}
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none" />
                
                {/* Video controls */}
                <div className="absolute bottom-4 left-4 flex items-center gap-3">
                  <button
                    onClick={toggleMute}
                    className="bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-all duration-200 hover:scale-110"
                  >
                    {isMuted ? (
                      <SpeakerXMarkIcon className="w-5 h-5" />
                    ) : (
                      <SpeakerWaveIcon className="w-5 h-5" />
                    )}
                  </button>
                  
                  {/* Volume slider */}
                  <div className="flex items-center gap-2 bg-black/50 rounded-full px-3 py-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                      className="volume-slider w-16 sm:w-20 h-1 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right,#5e44ef 0%, #5e44ef ${isMuted ? 0 : volume}%, #4b5563 ${isMuted ? 0 : volume}%, #4b5563 100%)`
                      }}
                    />
                    <span className="text-white text-xs font-medium min-w-[2rem] text-center">
                      {isMuted ? 0 : volume}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full">
                <Image
                  src={backdropUrl}
                  alt={title}
                  fill
                  className="object-cover rounded-t-lg"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                
                {/* Loading or no trailer message */}
                {isLoading ? (
                  <div className="absolute bottom-4 left-4 bg-black/50 text-white px-4 py-2 rounded-lg">
                    <span className="text-sm">Cargando trailer...</span>
                  </div>
                ) : !trailer ? (
                  <div className="absolute bottom-4 left-4 bg-black/50 text-white px-4 py-2 rounded-lg">
                    <span className="text-sm">Trailer no disponible</span>
                  </div>
                ) : null}
              </div>
            )}
          </div>
          )}
            
          {/* Close/Back button (siempre visible) */}
          {modalView !== 'info' && (
            <button
              onClick={handleBack}
              className={`absolute top-4 left-4 bg-black/50 hover:bg-black/70 text-white px-4 py-2 rounded-full transition-all duration-200 flex items-center gap-2 ${
                modalView === 'playing' ? 'z-[70]' : 'z-50'
              }`}
            >
              <ArrowLeftIcon className="w-5 h-5" />
              <span className="font-medium">Volver</span>
            </button>
          )}
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-all duration-200 ${
              modalView === 'playing' ? 'z-[70]' : 'z-50'
            }`}
          >
            <XMarkIcon className="w-6 h-6" />
          </button>

          {/* Content */}
          <div className={modalView === 'playing' ? 'relative h-full overflow-hidden' : 'p-3 sm:p-4 md:p-6'}>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-white text-lg">Cargando información...</div>
              </div>
            ) : (
              <>
                {/* Vista: Info */}
                {modalView === 'info' && (
                <>
                {/* Title and basic info */}
                <div className="mb-4 sm:mb-6">
                  <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-2">{title}</h2>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm sm:text-base text-gray-300 mb-4">
                    <span>{year}</span>
                    {getRuntimeInfo() && <span>{getRuntimeInfo()}</span>}
                    {details?.vote_average && (
                      <span className="bg-green-600 text-white px-2 py-1 rounded text-xs sm:text-sm">
                        {Math.round(details.vote_average * 10)}% coincidencia
                      </span>
                    )}
                  </div>
                  
                  {/* Action buttons */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
                    <button 
                      onClick={handlePlayClick}
                      disabled={!imdbId || loadingTorrents}
                      className="bg-white hover:bg-gray-200 text-black px-4 sm:px-6 md:px-8 py-2 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <PlayIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      {loadingTorrents ? 'Buscando...' : 'Reproducir'}
                    </button>
                    <button className="bg-gray-600/70 hover:bg-gray-600/90 text-white p-2 rounded-full transition-all duration-200 hover:scale-110 transform">
                      <PlusIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <button className="bg-gray-600/70 hover:bg-gray-600/90 text-white p-2 rounded-full transition-all duration-200 hover:scale-110 transform">
                      <HandThumbUpIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <button className="bg-gray-600/70 hover:bg-gray-600/90 text-white p-2 rounded-full transition-all duration-200 hover:scale-110 transform">
                      <HandThumbDownIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                  </div>
                </div>

                {/* Description and details */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                  <div className="lg:col-span-2">
                    <p className="text-gray-300 mb-4 leading-relaxed text-sm sm:text-base">
                      {item.overview}
                    </p>
                    
                    {getDirectorOrCreator() && (
                      <p className="text-gray-400 mb-2 text-sm sm:text-base">{getDirectorOrCreator()}</p>
                    )}
                    
                    {/* Genres */}
                    {details?.genres && details.genres.length > 0 && (
                      <p className="text-gray-400 mb-2 text-sm sm:text-base">
                        <span className="text-gray-500">Géneros: </span>
                        {details.genres.map(genre => genre.name).join(', ')}
                      </p>
                    )}
                  </div>
                  
                  {/* Cast */}
                  <div>
                    <h3 className="text-white font-semibold mb-3 text-base sm:text-lg">Reparto</h3>
                    <div className="space-y-2">
                      {cast.slice(0, 6).map((actor) => (
                        <div key={actor.id} className="text-gray-400 text-xs sm:text-sm">
                          <span className="text-gray-300">{actor.name}</span>
                          {actor.character && (
                            <span className="text-gray-500"> como {actor.character}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* TV Show specific: Seasons and Episodes */}
                {mediaType === 'tv' && details && (
                  <TVSeasonsAndEpisodes 
                    tvId={item.id} 
                    totalSeasons={(details as TVShowDetails).number_of_seasons}
                    onEpisodeClick={handleEpisodeClick}
                  />
                )}

                {/* Similar content section - Carrusel compacto */}
                {mediaType === 'movie' && suggestions.length > 0 && (
                  <div className="mt-6 sm:mt-8">
                    <h3 className="text-white font-semibold mb-4 text-lg sm:text-xl">Quizá también te guste</h3>
                    <div className="relative group">
                      {/* Botón navegación izquierda */}
                      <button
                        onClick={() => scrollSuggestions('left')}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/70 hover:bg-black/90 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 -ml-4"
                        aria-label="Anterior"
                      >
                        <ChevronLeftIcon className="w-6 h-6" />
                      </button>

                      {/* Contenedor del carrusel */}
                      <div 
                        ref={suggestionsScrollRef}
                        className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory"
                      >
                      {suggestions.slice(0, 10).map((movie, index) => (
                        <div 
                          key={`similar-${movie.id}-${movie.title?.replace(/\s+/g, '-')}-${index}`} 
                          className="flex-shrink-0 w-[120px] sm:w-[140px] cursor-pointer group/movie snap-start"
                          onClick={() => handleMovieClick(movie)}
                        >
                          <div className="aspect-[2/3] relative rounded-lg overflow-hidden mb-2">
                            {movie.poster_path ? (
                              <Image
                                src={getImageUrl(movie.poster_path, 'w342')}
                                alt={movie.title || 'Película'}
                                fill
                                className="object-cover transition-transform duration-300 group-hover/movie:scale-110"
                                sizes="140px"
                                priority={false}
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                                <span className="text-gray-500 text-xs">Sin imagen</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover/movie:bg-black/40 transition-colors duration-300 flex items-center justify-center">
                              <PlayIcon className="w-8 h-8 text-white opacity-0 group-hover/movie:opacity-100 transition-opacity duration-300 drop-shadow-lg" />
                            </div>
                          </div>
                          <h4 className="text-white text-xs font-medium line-clamp-2 mb-1">
                            {movie.title}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span>{getYear(movie.release_date)}</span>
                            {movie.vote_average && (
                              <span className="flex items-center">
                                ⭐ {movie.vote_average.toFixed(1)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      </div>

                      {/* Botón navegación derecha */}
                      <button
                        onClick={() => scrollSuggestions('right')}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/70 hover:bg-black/90 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 -mr-4"
                        aria-label="Siguiente"
                      >
                        <ChevronRightIcon className="w-6 h-6" />
                      </button>
                    </div>
                  </div>
                )}
                </>
                )}

                {/* Vista: Selector de Episodios (Series) */}
                {modalView === 'episode-selector' && mediaType === 'tv' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                        {title} - Seleccionar Episodio
                      </h2>
                      
                      {/* Selector de Temporada */}
                      {details && 'number_of_seasons' in details && (
                        <div className="mb-6">
                          <label className="text-white text-lg font-semibold mb-3 block">
                            Temporada:
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {Array.from({ length: details.number_of_seasons }, (_, i) => i + 1).map((season) => (
                              <button
                                key={season}
                                onClick={() => {
                                  setSelectedSeason(season);
                                  fetchSeasonData(season);
                                }}
                                className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                                  selectedSeason === season
                                    ? 'bg-red-600 text-white'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                              >
                                {season}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Grid de Episodios con Miniaturas */}
                      {loadingSeasonData ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="text-white text-lg">Cargando episodios...</div>
                        </div>
                      ) : seasonData && seasonData.episodes.length > 0 ? (
                        <div>
                          <label className="text-white text-lg font-semibold mb-3 block">
                            Episodio:
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {seasonData.episodes.map((episode) => (
                              <button
                                key={episode.id}
                                onClick={() => setSelectedEpisode(episode.episode_number)}
                                className={`group relative overflow-hidden rounded-lg transition-all ${
                                  selectedEpisode === episode.episode_number
                                    ? 'ring-4 ring-red-600'
                                    : 'hover:scale-105'
                                }`}
                              >
                                {/* Miniatura del episodio */}
                                <div className="relative w-full aspect-video bg-gray-800">
                                  {episode.still_path ? (
                                    <Image
                                      src={getImageUrl(episode.still_path, 'w500')}
                                      alt={episode.name}
                                      fill
                                      className="object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <PlayIcon className="w-12 h-12 text-gray-600" />
                                    </div>
                                  )}
                                  
                                  {/* Overlay con número de episodio */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-90 group-hover:opacity-100 transition-opacity">
                                    <div className="absolute bottom-0 left-0 right-0 p-3">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-white font-bold text-lg mb-1">
                                            {episode.episode_number}. {episode.name}
                                          </p>
                                          {episode.runtime && (
                                            <p className="text-gray-300 text-sm">
                                              {episode.runtime} min
                                            </p>
                                          )}
                                        </div>
                                        {selectedEpisode === episode.episode_number && (
                                          <div className="flex-shrink-0 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
                                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Ícono de play en hover */}
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                                      <PlayIcon className="w-8 h-8 text-white" />
                                    </div>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>

                          {/* Botón para buscar torrents */}
                          <div className="mt-6 flex justify-center">
                            <button
                              onClick={handleSearchSeriesTorrents}
                              disabled={loadingTorrents}
                              className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-lg font-semibold transition-all disabled:opacity-50"
                            >
                              {loadingTorrents ? 'Buscando Torrents...' : 'Buscar Torrents'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-gray-800 rounded-lg p-6 text-center">
                          <p className="text-gray-400">No hay episodios disponibles</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Vista: Lista de Torrents */}
                {modalView === 'torrents' && (
                  <div className="min-h-[60vh] flex flex-col">
                    {/* Error de torrents */}
                    {torrentError && (
                      <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg mb-4">
                        <p className="font-medium">Error</p>
                        <p className="text-sm">{torrentError}</p>
                      </div>
                    )}

                    {/* Loading */}
                    {loadingTorrents ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="text-white text-lg">Buscando torrents...</div>
                      </div>
                    ) : !selectedQuality ? (
                      /* Paso 1: Selector de Calidad */
                      <div className="flex-1 flex flex-col items-center justify-center">
                        <div className="text-center mb-8">
                          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow-lg">
                            Seleccionar Calidad
                          </h2>
                          <p className="text-lg md:text-xl text-gray-300 drop-shadow-md">
                            {title} {mediaType === 'tv' && `- T${selectedSeason}E${selectedEpisode}`}
                          </p>
                        </div>

                        {availableQualities.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 w-full max-w-4xl">
                            {availableQualities.map((quality) => {
                              const qualityTorrents = torrentsByQuality[quality] || [];
                              const qualityDownloaded = downloadedFilesByQuality[quality] || [];
                              const totalSeeds = qualityTorrents.reduce((sum, t) => sum + (t.seeds || 0), 0);
                              const totalOptions = qualityTorrents.length + qualityDownloaded.length;
                              
                              // Badge color based on quality
                              const badgeColor = 
                                quality === '4K' ? 'from-purple-600 to-pink-600' :
                                quality === '1080p' ? 'from-blue-600 to-cyan-600' :
                                quality === '720p' ? 'from-green-600 to-emerald-600' :
                                'from-gray-600 to-gray-700';
                              
                              return (
                                <button
                                  key={quality}
                                  onClick={() => setSelectedQuality(quality)}
                                  className="group relative bg-white/5 backdrop-blur-md hover:bg-white/10 rounded-2xl p-6 md:p-8 transition-all duration-300 border-2 border-white/10 hover:border-white/30 hover:scale-105 hover:shadow-2xl"
                                >
                                  {/* Badge de calidad con gradiente */}
                                  <div className={`inline-block bg-gradient-to-br ${badgeColor} text-white font-bold text-3xl md:text-4xl px-6 py-3 rounded-xl mb-4 shadow-lg`}>
                                    {quality}
                                  </div>

                                  {/* Stats */}
                                  <div className="space-y-2 text-sm md:text-base">
                                    <div className="flex items-center justify-between text-white">
                                      <span className="text-gray-400">📂 Opciones:</span>
                                      <span className="font-semibold">{totalOptions}</span>
                                    </div>
                                    {qualityDownloaded.length > 0 && (
                                      <div className="flex items-center justify-between text-white">
                                        <span className="text-gray-400">💾 Descargados:</span>
                                        <span className="font-semibold text-green-400">{qualityDownloaded.length}</span>
                                      </div>
                                    )}
                                    {qualityTorrents.length > 0 && (
                                      <div className="flex items-center justify-between text-white">
                                        <span className="text-gray-400">🌱 Hasta:</span>
                                        <span className="font-semibold text-green-400">{totalSeeds} seeds</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Arrow icon */}
                                  <div className="mt-4 flex justify-center">
                                    <svg className="w-6 h-6 text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="bg-white/5 rounded-lg p-8 text-center">
                            <p className="text-gray-400 text-lg mb-2">No se encontraron torrents</p>
                            <p className="text-gray-500 text-sm">
                              {!imdbId 
                                ? 'Contenido sin IMDb ID - búsqueda por título puede tener resultados limitados'
                                : 'Intenta con otro episodio'
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Paso 2: Lista de Torrents y Archivos Descargados de la calidad seleccionada */
                      <div>
                        <div className="mb-6 text-center">
                          <h2 className="text-3xl md:text-4xl font-bold text-white mb-2 drop-shadow-lg">
                            {selectedQuality}
                          </h2>
                          <p className="text-base md:text-lg text-gray-300 drop-shadow-md">
                            {(() => {
                              const qualityTorrents = torrentsByQuality[selectedQuality] || [];
                              const qualityDownloaded = downloadedFilesByQuality[selectedQuality] || [];
                              const totalOptions = qualityTorrents.length + qualityDownloaded.length;
                              return `${totalOptions} ${totalOptions === 1 ? 'opción disponible' : 'opciones disponibles'}`;
                            })()}
                          </p>
                        </div>

                        <div className="space-y-6">
                          {/* Archivos Descargados (mostrar primero) */}
                          {downloadedFilesByQuality[selectedQuality] && downloadedFilesByQuality[selectedQuality].length > 0 && (
                            <div>
                              <h3 className="text-lg font-semibold text-green-400 mb-3 flex items-center gap-2">
                                <span>💾</span>
                                Archivos Descargados ({downloadedFilesByQuality[selectedQuality].length})
                              </h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {downloadedFilesByQuality[selectedQuality].map((file, index) => (
                                  <button
                                    key={`downloaded-${file.id}`}
                                    onClick={() => handleSelectDownloadedFile(file)}
                                    className="group relative bg-green-500/10 backdrop-blur-md hover:bg-green-500/20 rounded-xl p-4 md:p-6 text-left transition-all duration-300 border border-green-500/30 hover:border-green-400/50 hover:shadow-lg hover:shadow-green-500/20 hover:scale-[1.02]"
                                  >
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="px-2 py-1 bg-green-600 text-white text-xs font-medium rounded">
                                            DESCARGADO
                                          </span>
                                        </div>
                                        <p className="text-white font-medium mb-2 line-clamp-2 text-sm md:text-base">
                                          {file.torrentTitle}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                                          <span className="text-gray-400">
                                            📦 {file.size}
                                          </span>
                                          <span className="text-green-400 font-semibold">
                                            ⚡ Instantáneo
                                          </span>
                                          <span className="text-gray-500 text-xs">
                                            GoFile
                                          </span>
                                        </div>
                                      </div>
                                      <div className="flex-shrink-0">
                                        <PlayIcon className="w-6 h-6 md:w-8 md:h-8 text-green-400 group-hover:text-green-300 transition-colors" />
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Torrents Disponibles */}
                          {torrentsByQuality[selectedQuality] && torrentsByQuality[selectedQuality].length > 0 && (
                            <div>
                              <h3 className="text-lg font-semibold text-blue-400 mb-3 flex items-center gap-2">
                                <span>🌱</span>
                                Torrents Disponibles ({torrentsByQuality[selectedQuality].length})
                              </h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {torrentsByQuality[selectedQuality].map((torrent, index) => {
                                  const seedCount = torrent.seeds || 0;
                                  const isHealthy = seedCount > 50;
                                  const isGood = seedCount > 10;
                                  
                                  return (
                                    <button
                                      key={`torrent-${index}`}
                                      onClick={() => handleSelectTorrent(torrent.magnetUri)}
                                      className="group relative bg-white/5 backdrop-blur-md hover:bg-white/10 rounded-xl p-4 md:p-6 text-left transition-all duration-300 border border-white/10 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/20 hover:scale-[1.02]"
                                    >
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-white font-medium mb-2 line-clamp-2 text-sm md:text-base">
                                            {torrent.title}
                                          </p>
                                          <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                                            {torrent.size && (
                                              <span className="text-gray-400">
                                                📦 {torrent.size}
                                              </span>
                                            )}
                                            <span className={`font-semibold ${
                                              isHealthy ? 'text-green-400' : 
                                              isGood ? 'text-yellow-400' : 
                                              'text-red-400'
                                            }`}>
                                              🌱 {seedCount} seeds
                                            </span>
                                            <span className="text-gray-500 text-xs">
                                              {torrent.source}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="flex-shrink-0">
                                          <PlayIcon className="w-6 h-6 md:w-8 md:h-8 text-gray-400 group-hover:text-blue-400 transition-colors" />
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Vista: Reproduciendo */}
                {modalView === 'playing' && (selectedMagnet || selectedDownloadedFile) && (
                  <div className="absolute inset-0">
                    {selectedDownloadedFile ? (
                      // Reproducir archivo descargado con VideoJS
                      <>
                        <VideoPlayer
                          videoRef={downloadedVideoRef}
                          className="w-full h-full"
                        />
                        
                        {/* Controles de subtítulos para archivos descargados */}
                        <SubtitleControls
                          isSearching={false}
                          downloadedSubtitles={[]}
                          onFileUpload={(file) => {
                            if (downloadedPlayerRef.current) {
                              addSubtitle(file);
                            }
                          }}
                        />
                        
                        {/* Modal de configuración de subtítulos - DESHABILITADO: Ahora se usa modal nativo en el player */}
                        {/* <SubtitleSettingsModal
                          isOpen={downloadedPlayerState.subtitleSettingsOpen}
                          onClose={closeSubtitleSettings}
                          onApply={applySubtitleSettings}
                          currentSettings={downloadedPlayerState.subtitleSettings}
                          movieTitle={selectedDownloadedFile.fileName}
                          playerRef={downloadedPlayerRef}
                        /> */}
                      </>
                    ) : selectedMagnet ? (
                      // Reproducir torrent con StreamingPlayer
                      <StreamingPlayer
                        magnetUri={selectedMagnet}
                        movieMetadata={{
                          tmdbId: item.id, // ✅ Mantener tmdbId como número para que se guarde correctamente en la base de datos
                          imdbId: imdbId || undefined,
                          title: mediaType === 'tv' 
                            ? `${title} S${selectedSeason}E${selectedEpisode}`
                            : title,
                          season: mediaType === 'tv' ? selectedSeason : undefined,
                          episode: mediaType === 'tv' ? selectedEpisode : undefined,
                          backdropPath: item.backdrop_path ? getImageUrl(item.backdrop_path, 'original') : undefined,
                          logoPath: getOriginalLogo(images),
                        }}
                        isModalPlayer={true}
                        onError={(error) => {
                          setTorrentError(error);
                          setModalView('torrents');
                        }}
                      />
                    ) : null}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}