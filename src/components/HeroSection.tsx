'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { PlayIcon, InformationCircleIcon, ChevronLeftIcon, ChevronRightIcon, SpeakerWaveIcon, SpeakerXMarkIcon, VideoCameraSlashIcon, VideoCameraIcon } from '@heroicons/react/24/solid';
import { getImageUrl, getOriginalTitle, getYear, getReleaseDate } from '@/lib/tmdb';
import { MediaItem, Video, TMDBImages } from '@/types/tmdb';
import InfoModal from './InfoModal';
import { logger } from '@/lib/logger';
import Hls from 'hls.js';

interface IMDBTrailerData {
  stream_url: string;
  kind: 'mp4' | 'm3u8' | 'unknown';
  title: string;
  duration_seconds: number;
  headers: {
    'Referer': string;
    'User-Agent': string;
  };
  cookie_header: string | null;
}

// Helper para obtener el logo original (solo en inglés)
const getOriginalLogo = (images: TMDBImages | null): string | undefined => {
  if (!images?.logos || images.logos.length === 0) {
    logger.log('🎨 [HERO] No hay logos disponibles');
    return undefined;
  }
  
  // Log de logos recibidos
  const languages = images.logos.map(l => l.iso_639_1 || 'null');
  logger.log(`🎨 [HERO] Logos recibidos (${images.logos.length}): idiomas [${languages.join(', ')}]`);
  
  // Solo aceptar logos en inglés
  const englishLogo = images.logos.find(logo => logo.iso_639_1 === 'en');
  
  if (englishLogo) {
    logger.log('✅ [HERO] Logo en inglés encontrado:', englishLogo.file_path);
  } else {
    logger.log('❌ [HERO] NO se encontró logo en inglés');
  }
  
  // Usar w342 para carga más rápida en hero section
  return englishLogo?.file_path ? getImageUrl(englishLogo.file_path, 'w342') : undefined;
};


interface HeroSectionProps {
  featuredItems?: MediaItem[];
}

export default function HeroSection({ featuredItems = [] }: HeroSectionProps) {
  // Filtrar contenido adulto por si acaso - memoizado para evitar re-renders
  const safeItems = useMemo(() => 
    featuredItems.filter(item => !item.adult), 
    [featuredItems]
  );
  
  const [currentItem, setCurrentItem] = useState<MediaItem | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [images, setImages] = useState<TMDBImages | null>(null);
  const [allImages, setAllImages] = useState<Map<number, TMDBImages>>(new Map()); // Cache de imágenes precargadas
  const [trailer, setTrailer] = useState<Video | null>(null);
  const [imdbTrailerData, setImdbTrailerData] = useState<IMDBTrailerData | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [visuallyHidden, setVisuallyHidden] = useState(false); // Para ocultar instantáneamente
  const [isMuted, setIsMuted] = useState(true); // Se desmutea automáticamente en onLoadedData
  const [userMuted, setUserMuted] = useState(false); // Rastrear si el usuario muteó manualmente
  const [isLoading, setIsLoading] = useState(false);
  const [hasPlayedVideo, setHasPlayedVideo] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [showVolumeControl, setShowVolumeControl] = useState(false);
  const [volume, setVolume] = useState(50);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [iframeVerificationTimer, setIframeVerificationTimer] = useState<ReturnType<typeof setTimeout> | null>(null); // Timer para verificar iframe
  const [trailersEnabled, setTrailersEnabled] = useState(true); // Estado para controlar si los trailers están habilitados
  const [showInfoModal, setShowInfoModal] = useState(false); // Estado para controlar el modal de información
  const [isTransitioning, setIsTransitioning] = useState(false); // Estado para controlar la transición
  const [isCompactMode, setIsCompactMode] = useState(false); // Para el modo compacto después de 5 segundos
  const videoRef = useRef<HTMLVideoElement>(null);
  const heroContainerRef = useRef<HTMLDivElement>(null);
  const autoPlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compactModeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedItemIdRef = useRef<number | null>(null); // Para evitar cargar el mismo trailer múltiples veces
  const volumeFadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Function to hide video and return to static image
  const hideVideoNow = () => {
    logger.log('🛑🛑🛑 HIDEVIDEONOW CALLED - STARTING HIDE PROCESS 🛑🛑🛑');
    logger.log('Current states before hiding:', {
      showVideo,
      videoEnded,
      visuallyHidden,
      hasPlayedVideo
    });
    
    // 1) Ocultar visualmente YA
    setVisuallyHidden(true);
    logger.log('✅ Set visuallyHidden to TRUE');

    // 2) Imperativo: parar el video
    const video = videoRef.current;
    if (video) {
      logger.log('📺 Found video element, stopping...');
      try {
        video.pause();
        video.currentTime = 0;
        video.src = '';
        logger.log('✅ Video stopped and src cleared');
      } catch (error) {
        logger.log('⚠️ Error stopping video:', error);
      }
    } else {
      logger.log('❌ No video element found in videoRef.current');
    }

    // 3) Desmontar en el próximo tick (opcional, pero limpia el DOM)
    // requestAnimationFrame asegura que la ocultación visual ya se aplicó
    requestAnimationFrame(() => {
      logger.log('🧹 Unmounting video component - setting showVideo=false, videoEnded=true');
      setShowVideo(false);
      setVideoEnded(true);
      logger.log('✅ Video component unmounted successfully');
    });
    
    logger.log('🛑🛑🛑 HIDEVIDEONOW COMPLETED 🛑🛑🛑');
  };

  // Cache de requests para evitar duplicados
  const imageRequestCache = useRef<Map<number, Promise<TMDBImages | null>>>(new Map());

  // Fetch images (logos) for current item con caché de requests
  const fetchImages = async (item: MediaItem) => {
    if (!item) return null;
    
    // Verificar si ya hay una request en curso para este item
    const cachedRequest = imageRequestCache.current.get(item.id);
    if (cachedRequest) {
      logger.log('🔄 Usando request en caché para:', item.id);
      return cachedRequest;
    }

    // Crear nueva request y guardarla en caché
    const request = (async () => {
      try {
        const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
        const response = await fetch(`/api/${mediaType}/${item.id}/images`);
        
        if (response.ok) {
          const data = await response.json();
          // Limpiar del caché una vez completada
          setTimeout(() => imageRequestCache.current.delete(item.id), 1000);
          return data;
        }
      } catch (error) {
        logger.error('Error fetching images:', error);
        imageRequestCache.current.delete(item.id);
      }
      return null;
    })();

    imageRequestCache.current.set(item.id, request);
    return request;
  };

  // Precargar solo los primeros 2 items (actual + siguiente) para carga rápida
  useEffect(() => {
    if (safeItems.length > 0 && allImages.size === 0) {
      logger.log('🖼️ Precargando imágenes de los primeros 2 slides...');
      const loadInitialImages = async () => {
        // Solo precargar primeros 2 items
        const itemsToLoad = safeItems.slice(0, 2);
        const imagePromises = itemsToLoad.map(async (item) => {
          const imageData = await fetchImages(item);
          return { id: item.id, data: imageData };
        });
        
        const results = await Promise.all(imagePromises);
        const newImageMap = new Map<number, TMDBImages>();
        
        results.forEach(result => {
          if (result.data) {
            newImageMap.set(result.id, result.data);
          }
        });
        
        setAllImages(newImageMap);
        logger.log('✅ Imágenes precargadas:', newImageMap.size);
        
        // AHORA sí setear el currentItem - DESPUÉS de tener las imágenes
        if (!currentItem && safeItems.length > 0) {
          setCurrentIndex(0);
          setCurrentItem(safeItems[0]);
        }
        
        // Lazy load el resto en background
        if (safeItems.length > 2) {
          setTimeout(() => {
            logger.log('🔄 Cargando resto de imágenes en background...');
            safeItems.slice(2).forEach(async (item) => {
              const imageData = await fetchImages(item);
              if (imageData) {
                setAllImages(prev => new Map(prev).set(item.id, imageData));
              }
            });
          }, 2000); // Esperar 2 segundos antes de cargar el resto
        }
      };
      
      loadInitialImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeItems.length]);

  // Eliminar el useEffect que setea el currentItem antes de tiempo
  // useEffect(() => {
  //   logger.log('🎲 Featured items effect triggered, items length:', safeItems.length);
  //   if (safeItems.length > 0 && !currentItem) {
  //     const firstIndex = 0;
  //     logger.log('🎯 Setting initial item at index:', firstIndex, safeItems[firstIndex]);
  //     setCurrentIndex(firstIndex);
  //     setCurrentItem(safeItems[firstIndex]);
  //   }
  // }, [safeItems.length]);

  // Fetch trailer from IMDB
  const fetchTrailer = async (item: MediaItem) => {
    if (!item) return;
    
    setIsLoading(true);
    setImdbTrailerData(null);
    setTrailer(null);
    
    try {
      // Obtener external_ids para conseguir el IMDB ID
      const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
      const externalIdsResponse = await fetch(
        `https://api.themoviedb.org/3/${mediaType}/${item.id}/external_ids?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`
      );
      
      if (!externalIdsResponse.ok) {
        logger.error('❌ Error fetching external IDs');
        setIsLoading(false);
        return;
      }
      
      const externalIds = await externalIdsResponse.json();
      const imdbId = externalIds.imdb_id;
      
      if (!imdbId) {
        logger.warn('⚠️ No IMDB ID found for item');
        setIsLoading(false);
        return;
      }
      
      logger.log('🎬 Fetching IMDB trailer for:', imdbId);
      
      // Llamar a nuestro endpoint de IMDB
      const imdbResponse = await fetch(`/api/imdb-trailer?imdbId=${imdbId}`);
      
      if (!imdbResponse.ok) {
        logger.error('❌ Error fetching IMDB trailer');
        setIsLoading(false);
        return;
      }
      
      const imdbData = await imdbResponse.json();
      
      logger.log('✅ IMDB trailer data:', {
        title: imdbData.title,
        duration: imdbData.duration_seconds,
        kind: imdbData.kind
      });
      
      setImdbTrailerData(imdbData);
      setVideoDuration(imdbData.duration_seconds);
      
      // Crear un objeto Video dummy para compatibilidad con el resto del código
      const dummyTrailer: Video = {
        id: 'imdb-' + imdbId,
        iso_639_1: 'en',
        iso_3166_1: 'US',
        key: imdbData.stream_url,
        name: imdbData.title,
        site: 'IMDB',
        size: 1080,
        type: 'Trailer',
        official: true,
        published_at: new Date().toISOString()
      };
      
      setTrailer(dummyTrailer);
      
    } catch (error) {
      logger.error('❌ Error fetching IMDB trailer:', error);
      setTrailer(null);
      setImdbTrailerData(null);
      setVideoDuration(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Eliminar el useEffect redundante que setea currentItem antes de tiempo
  // Ya se setea en loadInitialImages después de cargar las imágenes
  
  useEffect(() => {
    logger.log('🔄 Current item changed:', currentItem?.id, currentItem?.title || currentItem?.name);
    if (currentItem) {
      // Usar imágenes del cache (ya precargadas)
      const cachedImages = allImages.get(currentItem.id);
      if (cachedImages) {
        logger.log('✅ Usando imágenes del cache para:', currentItem.id);
        setImages(cachedImages);
      } else {
        logger.log('⚠️ No hay imágenes en cache, cargando...');
        // Fallback si no está en cache (no debería pasar)
        fetchImages(currentItem).then(data => {
          if (data) setImages(data);
        });
      }
      
      // Solo cargar trailer si realmente cambió el item (no por cambios en allImages)
      if (lastFetchedItemIdRef.current !== currentItem.id) {
        logger.log('🎬 Item cambió, cargando nuevo trailer');
        lastFetchedItemIdRef.current = currentItem.id;
        
        // Fetch trailer (esto sigue siendo necesario)
        fetchTrailer(currentItem);
        
        setShowVideo(false);
        setVisuallyHidden(false); // Reset visual state for new item
        setHasPlayedVideo(false); // Reset video played state for new item
        setVideoEnded(false); // Reset video ended state for new item
        // Reset mute state to true for new trailers to maintain consistency with iframe mute=1
        setIsMuted(true);
        setUserMuted(false); // Reset user mute preference for new trailer
        setVideoDuration(null); // Reset duration for new item
        
        // Clear any existing timeouts
        if (autoPlayTimeoutRef.current) {
          clearTimeout(autoPlayTimeoutRef.current);
        }
        if (durationTimeoutRef.current) {
          clearTimeout(durationTimeoutRef.current);
        }
      } else {
        logger.log('⏭️ Mismo item, no recargar trailer');
      }
    }
  }, [currentItem, allImages]);

  // Setup HLS.js para streams .m3u8
  useEffect(() => {
    if (!showVideo || !imdbTrailerData || !videoRef.current) return;
    
    const video = videoRef.current;
    
    // Si es MP4, el video nativo lo maneja
    if (imdbTrailerData.kind === 'mp4') {
      logger.log('📹 MP4 detected, using native video');
      return;
    }
    
    // Si es M3U8 y el navegador soporta HLS nativo (Safari)
    if (imdbTrailerData.kind === 'm3u8' && video.canPlayType('application/vnd.apple.mpegurl')) {
      logger.log('📹 M3U8 detected, using native HLS support');
      video.src = imdbTrailerData.stream_url;
      return;
    }
    
    // Si es M3U8 y necesitamos HLS.js
    if (imdbTrailerData.kind === 'm3u8' && Hls.isSupported()) {
      logger.log('📹 M3U8 detected, using HLS.js');
      const hls = new Hls();
      hls.loadSource(imdbTrailerData.stream_url);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        logger.log('✅ HLS manifest parsed, playing...');
        video.play().catch(e => logger.error('Error playing HLS:', e));
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        logger.error('❌ HLS error:', data);
        if (data.fatal) {
          hls.destroy();
        }
      });
      
      return () => {
        hls.destroy();
      };
    }
    
    logger.warn('⚠️ No HLS support detected');
  }, [showVideo, imdbTrailerData]);

  useEffect(() => {
    if (trailer && !showVideo && !hasPlayedVideo && !videoEnded && trailersEnabled) {
      logger.log('🎯 Setting up auto-play timer for trailer:', trailer.key);
      logger.log('📏 Video duration available:', videoDuration);
      
      // Auto-play trailer after 5 seconds only if it hasn't been played yet and hasn't ended
      autoPlayTimeoutRef.current = setTimeout(() => {
        logger.log('▶️ Starting video playback');
        setShowVideo(true);
        setHasPlayedVideo(true);
        
        // El video se reproducirá completo y el evento onEnded se encargará de ocultarlo
        logger.log(`🎬 Video duration: ${videoDuration}s, se reproducirá completo`);
        
      }, 1000);
    }
    
    return () => {
      if (autoPlayTimeoutRef.current) {
        clearTimeout(autoPlayTimeoutRef.current);
      }
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
      }
    };
  }, [trailer, trailersEnabled]); // Removed videoDuration to prevent re-mounting

  // Efecto para activar modo compacto después de 5 segundos de reproducción
  useEffect(() => {
    if (showVideo && !visuallyHidden) {
      logger.log('🎯 Video playing, starting 5s timer for compact mode');
      
      compactModeTimeoutRef.current = setTimeout(() => {
        logger.log('✨ Activating compact mode');
        setIsCompactMode(true);
      }, 5000);
    } else {
      // Resetear modo compacto cuando el video no se esté mostrando
      setIsCompactMode(false);
      if (compactModeTimeoutRef.current) {
        clearTimeout(compactModeTimeoutRef.current);
      }
    }
    
    return () => {
      if (compactModeTimeoutRef.current) {
        clearTimeout(compactModeTimeoutRef.current);
      }
    };
  }, [showVideo, visuallyHidden]);

  // Función para hacer fade del volumen
  const fadeVolume = (targetVolume: number, duration: number = 500) => {
    const video = videoRef.current;
    if (!video) return;

    // Limpiar intervalo anterior si existe
    if (volumeFadeIntervalRef.current) {
      clearInterval(volumeFadeIntervalRef.current);
    }

    const startVolume = video.volume;
    const volumeDiff = targetVolume - startVolume;
    const steps = 20;
    const stepDuration = duration / steps;
    const stepChange = volumeDiff / steps;
    let currentStep = 0;

    volumeFadeIntervalRef.current = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        video.volume = targetVolume;
        if (volumeFadeIntervalRef.current) {
          clearInterval(volumeFadeIntervalRef.current);
        }
        logger.log(`✅ Fade completado: volumen = ${targetVolume}`);
      } else {
        video.volume = Math.max(0, Math.min(1, startVolume + (stepChange * currentStep)));
      }
    }, stepDuration);
  };

  // Efecto para pausar/reanudar video según scroll (IntersectionObserver)
  useEffect(() => {
    const heroContainer = heroContainerRef.current;
    const video = videoRef.current;
    
    if (!heroContainer || !video) return;

    let isPausedByScroll = false;
    let savedVolume = volume;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Si el hero está visible (más del 30% visible)
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            logger.log('👁️ Hero visible, reanudar video');
            
            if (isPausedByScroll && showVideo && !visuallyHidden && video.paused) {
              // Reanudar video y hacer fade in del volumen SOLO si el usuario no ha muteado manualmente
              logger.log(`▶️ Reanudando video con fade in a volumen: ${savedVolume}, userMuted: ${userMuted}`);
              if (!userMuted) {
                video.muted = false;
              }
              video.play().then(() => {
                if (!userMuted) {
                  fadeVolume(savedVolume / 100, 800);
                }
                isPausedByScroll = false;
                logger.log('✅ Video reanudado con fade in');
              }).catch(err => logger.error('❌ Error al reanudar video:', err));
            }
          } else {
            // Hero no está visible (scroll hacia abajo)
            logger.log('👁️ Hero oculto, pausar video');
            
            if (showVideo && !visuallyHidden && !video.paused) {
              // Guardar volumen actual antes de fade
              savedVolume = volume;
              isPausedByScroll = true;
              logger.log(`⏸️ Pausando video, guardando volumen: ${savedVolume}`);
              
              // Hacer fade out y luego pausar
              fadeVolume(0, 500);
              setTimeout(() => {
                video.pause();
                logger.log('✅ Video pausado con fade out completado');
              }, 500);
            }
          }
        });
      },
      {
        threshold: [0, 0.3, 0.5, 1], // Múltiples umbrales para mejor detección
        rootMargin: '0px' // Sin margen adicional
      }
    );

    observer.observe(heroContainer);

    return () => {
      observer.disconnect();
      if (volumeFadeIntervalRef.current) {
        clearInterval(volumeFadeIntervalRef.current);
      }
    };
  }, [showVideo, visuallyHidden, volume, userMuted]);

  // Debug: Log when useEffect cleanup runs
  useEffect(() => {
    return () => {
      logger.log('🧹 CLEANUP RUNNING - This might cancel our timer!');
      logger.log('States at cleanup:', { showVideo, hasPlayedVideo, videoEnded, videoDuration });
      if (autoPlayTimeoutRef.current) {
        logger.log('🚫 Clearing autoPlayTimeout');
        clearTimeout(autoPlayTimeoutRef.current);
      }
      if (durationTimeoutRef.current) {
        logger.log('🚫 Clearing durationTimeout - THIS CANCELS OUR HIDE TIMER!');
        clearTimeout(durationTimeoutRef.current);
      }
    };
  }, [trailer, trailersEnabled]); // REMOVED problematic dependencies that cause re-execution

  // Auto-rotation disabled - slides change manually only
  // useEffect(() => {
  //   if (safeItems.length > 1 && !showVideo) {
  //     // Auto-rotate every 8 seconds, but only when video is not playing
  //     const interval = setInterval(() => {
  //       setCurrentIndex((prevIndex) => {
  //         const nextIndex = (prevIndex + 1) % safeItems.length;
  //         setCurrentItem(safeItems[nextIndex]);
  //         return nextIndex;
  //       });
  //     }, 8000);

  //     return () => clearInterval(interval);
  //   }
  // }, [safeItems, showVideo]);

  // Función para cambiar de slide con transición suave
  const changeSlide = (newIndex: number) => {
    if (isTransitioning || newIndex === currentIndex) return;
    
    logger.log('🔄 Starting transition to index:', newIndex);
    setIsTransitioning(true);
    
    // Fade out (300ms)
    setTimeout(() => {
      // Cambiar el contenido
      setCurrentIndex(newIndex);
      setCurrentItem(safeItems[newIndex]);
      
      // Fade in después de un pequeño delay (50ms para asegurar que el DOM se actualice)
      setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 300);
  };

  const navigateToNext = () => {
    logger.log('➡️ Navigate to next clicked, current index:', currentIndex, 'total items:', safeItems.length);
    if (safeItems.length > 1 && !isTransitioning) {
      const nextIndex = (currentIndex + 1) % safeItems.length;
      logger.log('➡️ Moving to next index:', nextIndex);
      changeSlide(nextIndex);
    }
  };

  const navigateToPrevious = () => {
    logger.log('⬅️ Navigate to previous clicked, current index:', currentIndex, 'total items:', safeItems.length);
    if (safeItems.length > 1 && !isTransitioning) {
      const prevIndex = currentIndex === 0 ? safeItems.length - 1 : currentIndex - 1;
      logger.log('⬅️ Moving to previous index:', prevIndex);
      changeSlide(prevIndex);
    }
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    setUserMuted(newMutedState); // Marcar que el usuario ha interactuado con el mute
    
    // Control native video element
    if (videoRef.current) {
      videoRef.current.muted = newMutedState;
      // Si desmutea, asegurarse de que el volumen esté configurado
      if (!newMutedState && videoRef.current.volume === 0) {
        videoRef.current.volume = volume / 100;
      }
    }
  };

  const handleVolumeMouseEnter = () => {
    if (volumeTimeoutRef.current) {
      clearTimeout(volumeTimeoutRef.current);
    }
    setShowVolumeControl(true);
  };

  const handleVolumeMouseLeave = () => {
    volumeTimeoutRef.current = setTimeout(() => {
      setShowVolumeControl(false);
    }, 1000); // Hide after 1 second
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    
    // Control native video element volume
    if (videoRef.current) {
      videoRef.current.volume = newVolume / 100;
    }
    
    // If volume is 0, mute the video, otherwise unmute
    if (newVolume === 0 && !isMuted) {
      setIsMuted(true);
      setUserMuted(true); // Usuario bajó el volumen a 0 = mute manual
      if (videoRef.current) {
        videoRef.current.muted = true;
      }
    } else if (newVolume > 0 && isMuted) {
      setIsMuted(false);
      setUserMuted(false); // Usuario subió el volumen = unmute manual
      if (videoRef.current) {
        videoRef.current.muted = false;
      }
    }
  };

  const handleVideoClick = () => {
    if (trailer) {
      setShowVideo(!showVideo);
    }
  };

  // Función para cargar preferencias de localStorage
  useEffect(() => {
    const savedPreference = localStorage.getItem('trailersEnabled');
    if (savedPreference !== null) {
      setTrailersEnabled(JSON.parse(savedPreference));
    }
  }, []);

  // Función para toggle de trailers
  const toggleTrailers = () => {
    const newValue = !trailersEnabled;
    setTrailersEnabled(newValue);
    localStorage.setItem('trailersEnabled', JSON.stringify(newValue));
    
    // Si se deshabilitan los trailers y hay uno reproduciéndose, ocultarlo
    if (!newValue && showVideo) {
      hideVideoNow();
    }
  };

  const openInfoModal = () => {
    setShowInfoModal(true);
  };

  const closeInfoModal = () => {
    setShowInfoModal(false);
  };

  // Handle movie selection from similar movies
  const handleMovieSelect = (movie: any) => {
    // Convert the movie to MediaItem format and update currentItem
    const movieAsMediaItem = {
      ...movie,
      media_type: 'movie' as const
    };
    setCurrentItem(movieAsMediaItem);
    // Keep the modal open to show the new movie
  };

  if (!currentItem || allImages.size === 0) {
    return (
      <div className="relative h-[80vh] bg-black flex items-center justify-center mt-24">
        {/* Skeleton Loader completo para el hero */}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-800 via-gray-800 to-black animate-pulse" />
        
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
        
        {/* Content Skeleton */}
        <div className="relative z-10 w-full px-4 md:px-8 max-w-7xl">
          <div className="space-y-6 max-w-2xl">
            {/* Logo/Title Skeleton */}
            <div className="h-32 w-96 bg-gray-700 rounded-lg animate-pulse" />
            
            {/* Metadata Skeleton */}
            <div className="flex items-center gap-4">
              <div className="h-6 w-20 bg-gray-700 rounded animate-pulse" />
              <div className="h-6 w-16 bg-gray-700 rounded animate-pulse" />
              <div className="h-6 w-24 bg-gray-700 rounded animate-pulse" />
            </div>
            
            {/* Overview Skeleton */}
            <div className="space-y-2">
              <div className="h-4 bg-gray-700 rounded animate-pulse w-full" />
              <div className="h-4 bg-gray-700 rounded animate-pulse w-5/6" />
              <div className="h-4 bg-gray-700 rounded animate-pulse w-4/6" />
            </div>
            
            {/* Buttons Skeleton */}
            <div className="flex gap-4">
              <div className="h-14 w-36 bg-gray-700 rounded-lg animate-pulse" />
              <div className="h-14 w-36 bg-gray-700 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
        
        {/* Loading text */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-gray-400 text-sm">
          Cargando contenido destacado...
        </div>
      </div>
    );
  }

  const mediaType = currentItem.media_type || (currentItem.title ? 'movie' : 'tv');
  const title = getOriginalTitle(currentItem);
  const year = getYear(getReleaseDate(currentItem));
  const backdropUrl = getImageUrl(currentItem.backdrop_path, 'original');

  return (
    <div ref={heroContainerRef} className="relative h-screen group pt-24">
      {/* Renderizar TODAS las imágenes de backdrop (ocultas menos la actual) para precargarlas */}
      {safeItems.map((item, index) => {
        const itemBackdropUrl = getImageUrl(item.backdrop_path, 'original');
        const isActive = index === currentIndex;
        
        return (
          <div 
            key={item.id} 
            className={`absolute inset-0 transition-opacity duration-150 ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
          >
            <Image
              src={itemBackdropUrl}
              alt={getOriginalTitle(item)}
              fill
              className="object-cover"
              style={{ objectPosition: 'center center' }}
              priority={index < 2} // Solo priority para las primeras 2
              loading={index < 2 ? 'eager' : 'lazy'}
            />
          </div>
        );
      })}

      {/* Gradientes para las imágenes - Estilo Netflix */}
      <div className="absolute inset-0 z-15 pointer-events-none">
        {/* Gradiente superior */}
        <div className="absolute top-0 left-0 right-0 h-[400px]"
             style={{
               background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.5) 25%, rgba(0,0,0,0.3) 50%, transparent 100%)'
             }} />
        
        {/* Gradiente inferior con blur */}
        <div className="absolute bottom-0 left-0 right-0 h-[400px]">
          <div className="absolute inset-0"
               style={{
                 background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 15%, rgba(0,0,0,0.7) 35%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.2) 80%, transparent 100%)'
               }} />
          <div className="absolute inset-0 backdrop-blur-sm"
               style={{
                 maskImage: 'linear-gradient(to top, black 0%, black 10%, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.4) 60%, transparent 100%)',
                 WebkitMaskImage: 'linear-gradient(to top, black 0%, black 10%, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.4) 60%, transparent 100%)'
               }} />
        </div>
        
        {/* Gradiente izquierdo */}
        <div className="absolute top-0 bottom-0 left-0 w-[300px]"
             style={{
               background: 'linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)'
             }} />
        
        {/* Gradiente derecho */}
        <div className="absolute top-0 bottom-0 right-0 w-[300px]"
             style={{
               background: 'linear-gradient(to left, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)'
             }} />
      </div>


      {/* Video Layer - IMDB Trailer */}
      {showVideo && trailer && imdbTrailerData && (
        <div className={`absolute inset-0 z-20 transition-opacity duration-75 ${
          visuallyHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          <div className="relative w-full h-full bg-black">
            <video
              ref={videoRef}
              className="absolute w-full h-full object-cover z-0"
              autoPlay
              muted
              playsInline
              onLoadedData={(e) => {
                // 🔇 ESTRATEGIA NETFLIX: Play muted primero, desmutear después
                const video = e.currentTarget;
                video.muted = true; // Asegurar que está muted
                video.volume = volume / 100; // Pre-configurar volumen
                
                video.play().then(() => {
                  logger.log('📺 Video playing (muted inicialmente)');
                  
                  // 🔊 Desmutear después de 300ms
                  setTimeout(() => {
                    if (!userMuted && video) {
                      video.muted = false;
                      setIsMuted(false);
                      logger.log('🔊 Video auto-unmuted');
                    }
                  }, 300);
                }).catch(err => {
                  logger.error('❌ Error playing video:', err);
                  // Fallback: intentar muted si falla
                  video.muted = true;
                  setIsMuted(true);
                  video.play().catch(e => logger.error('❌ Error even with muted:', e));
                });
              }}
              onEnded={() => {
                logger.log('📺 Video ended');
                setVideoEnded(true);
                setShowVideo(false);
                setVisuallyHidden(false);
              }}
              style={{
                pointerEvents: 'none'
              }}
            >
              <source src={imdbTrailerData.stream_url} type={imdbTrailerData.kind === 'mp4' ? 'video/mp4' : 'application/x-mpegURL'} />
            </video>
            
            {/* Gradientes para el video - Estilo Netflix */}
            <div className="absolute inset-0 z-10 pointer-events-none">
              {/* Gradiente superior */}
              <div className="absolute top-0 left-0 right-0 h-[400px]"
                   style={{
                     background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.5) 25%, rgba(0,0,0,0.3) 50%, transparent 100%)'
                   }} />
              
              {/* Gradiente inferior con blur */}
              <div className="absolute bottom-0 left-0 right-0 h-[400px]">
                <div className="absolute inset-0"
                     style={{
                       background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 15%, rgba(0,0,0,0.7) 35%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.2) 80%, transparent 100%)'
                     }} />
                <div className="absolute inset-0 backdrop-blur-sm"
                     style={{
                       maskImage: 'linear-gradient(to top, black 0%, black 10%, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.4) 60%, transparent 100%)',
                       WebkitMaskImage: 'linear-gradient(to top, black 0%, black 10%, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.4) 60%, transparent 100%)'
                     }} />
              </div>
              
              {/* Gradiente izquierdo */}
              <div className="absolute top-0 bottom-0 left-0 w-[300px]"
                   style={{
                     background: 'linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)'
                   }} />
              
              {/* Gradiente derecho */}
              <div className="absolute top-0 bottom-0 right-0 w-[300px]"
                   style={{
                     background: 'linear-gradient(to left, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)'
                   }} />
            </div>
          </div>
        </div>
      )}

      {/* Navigation Arrows */}
      {safeItems.length > 1 && (
        <>
          <button
            onClick={navigateToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-50 bg-black/48 hover:bg-black/54 text-white p-4 rounded-full transition-all duration-300 hover:scale-110 shadow-xl"
          >
            <ChevronLeftIcon className="w-8 h-8" />
          </button>
          <button
            onClick={navigateToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-50 bg-black/48 hover:bg-black/54 text-white p-4 rounded-full transition-all duration-300 hover:scale-110 shadow-xl"
          >
            <ChevronRightIcon className="w-8 h-8" />
          </button>
        </>
      )}

      {/* Content */}
      <div className="absolute inset-0 flex items-end z-30 pb-100">
        <div className="px-30">
          <div className={`max-w-3xl transition-all duration-700 ease-in-out ${isCompactMode ? 'translate-y-[60px]' : ''}`}>
            {/* Logo o Título */}
            {getOriginalLogo(images) ? (
              <div className={`mb-5 transition-all duration-700 ease-in-out origin-left ${isCompactMode ? 'scale-75' : 'scale-100'}`}>
                <img
                  src={getOriginalLogo(images)}
                  alt={title}
                  className="w-full h-auto"
                  style={{ maxWidth: '520px', maxHeight: '175px', objectFit: 'contain', objectPosition: 'left' }}
                  loading="eager"
                  fetchPriority="high"
                />
              </div>
            ) : (
              <h1 className={`text-5xl md:text-6xl font-bold text-white mb-5 transition-all duration-700 ease-in-out ${isCompactMode ? 'scale-75' : 'scale-100'}`} style={{ textShadow: '2px 2px 12px rgba(0,0,0,0.9)' }}>
                {title}
              </h1>
            )}
            <p className={`text-lg md:text-xl text-white mb-2 font-medium transition-all duration-700 ease-in-out ${isCompactMode ? 'opacity-0 h-0 mb-0' : 'opacity-100'}`} style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
              {year}
            </p>
            <p className={`text-lg md:text-xl text-white mb-8 line-clamp-3 max-w-3xl leading-relaxed transition-all duration-700 ease-in-out ${isCompactMode ? 'opacity-0 h-0 mb-0' : 'opacity-100'}`} style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
              {currentItem.overview}
            </p>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-4">
              <Link
                href={mediaType === 'movie' ? `/watch?type=movie&id=${currentItem.id}` : `/${mediaType}/${currentItem.id}`}
                className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-200 text-black px-6 h-14 rounded-lg font-semibold text-base transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                <PlayIcon className="w-6 h-6" />
                Ver ahora
              </Link>
              
              <button
                className="inline-flex items-center justify-center bg-white hover:bg-gray-200 text-black w-14 h-14 rounded-full font-semibold transition-all duration-200 shadow-lg hover:shadow-xl group/info"
                title="Más información"
                onClick={openInfoModal}
              >
                <InformationCircleIcon className="w-7 h-7" />
              </button>

              {/* Mute/Unmute Button with Volume Control - Only show when video is playing */}
              {showVideo && trailer && (
                <div 
                  className="relative animate-in fade-in duration-500"
                  onMouseEnter={handleVolumeMouseEnter}
                  onMouseLeave={handleVolumeMouseLeave}
                >
                  <button
                    onClick={toggleMute}
                    className="inline-flex items-center justify-center bg-white hover:bg-gray-200 text-black w-14 h-14 rounded-full font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
                    title={isMuted ? "Activar sonido" : "Silenciar"}
                  >
                    {isMuted ? (
                      <SpeakerXMarkIcon className="w-7 h-7" />
                    ) : (
                      <SpeakerWaveIcon className="w-7 h-7" />
                    )}
                  </button>
                  
                  {/* Volume Control Slider - Only show when not muted */}
                  {showVolumeControl && !isMuted && (
                    <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={volume}
                          onChange={(e) => handleVolumeChange(Number(e.target.value))}
                          className="w-24 accent-black"
                        />
                        <span className="text-sm font-medium text-black min-w-[3ch]">{volume}%</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

       {/* Trailer Toggle Button - Top Right */}
       <button
         onClick={toggleTrailers}
         className="absolute top-28 right-4 z-30 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl backdrop-blur-sm"
         title={trailersEnabled ? "Deshabilitar trailers" : "Habilitar trailers"}
       >
         {trailersEnabled ? (
           <VideoCameraIcon className="w-6 h-6" />
         ) : (
           <VideoCameraSlashIcon className="w-6 h-6" />
         )}
       </button>

      {/* Indicators */}
      {safeItems.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 z-50 hidden">
          {safeItems.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                if (!isTransitioning) {
                  logger.log('🔘 Dot indicator clicked, changing to index:', index);
                  changeSlide(index);
                }
              }}
              className={`w-3 h-3 rounded-full transition-all duration-300 shadow-lg border border-white/30 ${
                index === currentIndex 
                  ? 'bg-white scale-125 shadow-white/50' 
                  : 'bg-white/60 hover:bg-white/80 hover:scale-110'
              }`}
            />
          ))}
       </div>
      )}

      {/* Info Modal */}
      {showInfoModal && currentItem && (
        <InfoModal
          item={currentItem as MediaItem}
          isOpen={showInfoModal}
          onClose={closeInfoModal}
          onMovieSelect={handleMovieSelect}
        />
      )}
    </div>
  );
}