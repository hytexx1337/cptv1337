'use client';

import { logger } from '@/lib/logger';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { PlayIcon, InformationCircleIcon, ChevronLeftIcon, ChevronRightIcon, SpeakerWaveIcon, SpeakerXMarkIcon, VideoCameraSlashIcon, VideoCameraIcon } from '@heroicons/react/24/solid';
import { getImageUrl, getTitle, getYear, getReleaseDate } from '@/lib/tmdb';
import { MediaItem, Video } from '@/types/tmdb';
import InfoModal from './InfoModal';

interface HeroSectionProps {
  featuredItems?: MediaItem[];
}

export default function HeroSection({ featuredItems = [] }: HeroSectionProps) {
  const [currentItem, setCurrentItem] = useState<MediaItem | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [trailer, setTrailer] = useState<Video | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [visuallyHidden, setVisuallyHidden] = useState(false); // Para ocultar instantáneamente
  const [isMuted, setIsMuted] = useState(false);
  const [hasPlayedVideo, setHasPlayedVideo] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [showVolumeControl, setShowVolumeControl] = useState(false);
  const [volume, setVolume] = useState(50);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [iframeVerificationTimer, setIframeVerificationTimer] = useState<NodeJS.Timeout | null>(null); // Timer para verificar iframe
  const [trailersEnabled, setTrailersEnabled] = useState(true); // Estado para controlar si los trailers están habilitados
  const [showInfoModal, setShowInfoModal] = useState(false); // Estado para controlar el modal de información
  const videoRef = useRef<HTMLIFrameElement>(null);
  const autoPlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const volumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const durationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Función para ocultar el video INSTANTÁNEAMENTE (solución de ChatGPT)
  const hideVideoNow = () => {
    // 1. Ocultar visualmente de inmediato
    setVisuallyHidden(true);
    
    // 2. Detener el video de YouTube
    const iframe = videoRef.current;
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
      } catch (error) {
        logger.error('Error enviando stopVideo:', error);
      }
    }
    
    // 3. Cambiar src del iframe a about:blank para prevenir sugerencias
    if (iframe) {
      iframe.src = 'about:blank';
      
      // Verificar periódicamente si el iframe mantiene about:blank
      if (iframeVerificationTimer) {
        clearInterval(iframeVerificationTimer);
      }
      
      const verificationTimer = setInterval(() => {
        if (iframe.src !== 'about:blank') {
          logger.log(`iframe src cambió a: ${iframe.src}`);
        }
      }, 1000);
      
      setIframeVerificationTimer(verificationTimer);
      
      // Limpiar el timer después de 10 segundos
      setTimeout(() => {
        clearInterval(verificationTimer);
        setIframeVerificationTimer(null);
      }, 10000);
    }
    
    // 4. Desmontar el componente de video en el siguiente tick
    setTimeout(() => {
      setShowVideo(false);
    }, 0);
  };

  // Fetch trailer for current item
  const fetchTrailer = async (item: MediaItem) => {
    if (!item) return;
    
    // setIsLoading(true);
    try {
      const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
      const response = await fetch(`/api/${mediaType}/${item.id}/videos`);
      
      if (response.ok) {
        const data = await response.json();
        const trailer = data.results.find((video: Video) => 
          video.type === 'Trailer' && video.site === 'YouTube'
        );
        setTrailer(trailer || null);
        
        // Fetch video duration from YouTube API
        if (trailer) {
          try {
            const youtubeResponse = await fetch(
              `https://www.googleapis.com/youtube/v3/videos?id=${trailer.key}&part=contentDetails&key=${process.env.NEXT_PUBLIC_YOUTUBE_API_KEY}`
            );
            
            if (youtubeResponse.ok) {
              const youtubeData = await youtubeResponse.json();
              
              if (youtubeData.items && youtubeData.items.length > 0) {
                const duration = youtubeData.items[0].contentDetails.duration;
                
                // Convert ISO 8601 duration to seconds
                const durationInSeconds = parseDuration(duration);
                setVideoDuration(durationInSeconds);
              } else {
                logger.warn('No video data found in YouTube API response');
                setVideoDuration(null);
              }
            } else {
              logger.error('YouTube API request failed:', youtubeResponse.status);
              setVideoDuration(null);
            }
          } catch (error) {
            logger.error('Error fetching video duration:', error);
            setVideoDuration(null);
          }
        }
      } else {
        setTrailer(null);
        setVideoDuration(null);
      }
    } catch (error) {
      logger.error('Error fetching trailer:', error);
      setTrailer(null);
      setVideoDuration(null);
    } finally {
      // Loading state removed
    }
  };

  // Helper function to parse ISO 8601 duration to seconds
  const parseDuration = (duration: string): number => {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    
    return hours * 3600 + minutes * 60 + seconds;
  };

  useEffect(() => {
    logger.log('[RANDOM] Featured items effect triggered, items length:', featuredItems.length);
    if (featuredItems.length > 0) {
      // Set initial random item
      const randomIndex = Math.floor(Math.random() * featuredItems.length);
      logger.log('[TARGET] Setting initial item at index:', randomIndex, featuredItems[randomIndex]);
      setCurrentIndex(randomIndex);
      setCurrentItem(featuredItems[randomIndex]);
    }
  }, [featuredItems]);

  useEffect(() => {
    logger.log('[CHANGE] Current item changed:', currentItem?.id, currentItem?.title || currentItem?.name);
    if (currentItem) {
      fetchTrailer(currentItem);
      setShowVideo(false);
      setVisuallyHidden(false); // Reset visual state for new item
      setHasPlayedVideo(false); // Reset video played state for new item
      setVideoEnded(false); // Reset video ended state for new item
      // Reset mute state to false for new trailers to maintain consistency
      setIsMuted(false);
      setVideoDuration(null); // Reset duration for new item
      
      // Clear any existing timeouts
      if (autoPlayTimeoutRef.current) {
        clearTimeout(autoPlayTimeoutRef.current);
      }
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
      }
    }
  }, [currentItem, fetchTrailer]);

  useEffect(() => {
    if (trailer && !showVideo && !hasPlayedVideo && !videoEnded && trailersEnabled) {
      logger.log('Setting up auto-play timer for trailer:', trailer.key);
      logger.log('Video duration available:', videoDuration);
      
      // Auto-play trailer after 5 seconds only if it hasn't been played yet and hasn't ended
      autoPlayTimeoutRef.current = setTimeout(() => {
        logger.log('Starting video playback');
        setShowVideo(true);
        setHasPlayedVideo(true);
        
        if (videoDuration && videoDuration > 10) {
          // SMART SOLUTION: Use actual video duration - hide 5 seconds before it ends for smoother transition
          const hideTime = (videoDuration - 5) * 1000; // Convert to milliseconds, hide 5s before end
          logger.log(`[SMART] SMART timer: Video is ${videoDuration}s, hiding at ${videoDuration - 5}s (${hideTime}ms)`);
          logger.log(`[TIMER] Timer will execute in ${hideTime / 1000} seconds from now`);
          
          durationTimeoutRef.current = setTimeout(() => {
            logger.log(`[HIDE] Hiding video (SMART timer at ${videoDuration - 5}s) - 5s before natural end`);
            logger.log('[TIME] Timer executed at:', new Date().toLocaleTimeString());
            setVideoEnded(true);
            hideVideoNow(); // Use instant hide solution
          }, hideTime);
        } else {
          // FALLBACK: If no duration available, use 75s timer
          logger.log('[TIMER] Using FALLBACK timer (75s) - no duration available or video too short');
          
          durationTimeoutRef.current = setTimeout(() => {
            logger.log('[HIDE] Hiding video (FALLBACK 75s timer)');
            setVideoEnded(true);
            hideVideoNow(); // Use instant hide solution
          }, 75000); // 75 seconds fallback
        }
        
      }, 5000);
    }
    
    return () => {
      if (autoPlayTimeoutRef.current) {
        clearTimeout(autoPlayTimeoutRef.current);
      }
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
      }
    };
  }, [trailer, showVideo, hasPlayedVideo, videoEnded, videoDuration, trailersEnabled, hideVideoNow]);

  // Auto-rotation disabled - slides change manually only
  // useEffect(() => {
  //   if (featuredItems.length > 1 && !showVideo) {
  //     // Auto-rotate every 8 seconds, but only when video is not playing
  //     const interval = setInterval(() => {
  //       setCurrentIndex((prevIndex) => {
  //         const nextIndex = (prevIndex + 1) % featuredItems.length;
  //         setCurrentItem(featuredItems[nextIndex]);
  //         return nextIndex;
  //       });
  //     }, 8000);

  //     return () => clearInterval(interval);
  //   }
  // }, [featuredItems, showVideo]);

  const navigateToNext = () => {
    if (featuredItems.length > 1) {
      const nextIndex = (currentIndex + 1) % featuredItems.length;
      setCurrentIndex(nextIndex);
      setCurrentItem(featuredItems[nextIndex]);
    }
  };

  const navigateToPrevious = () => {
    if (featuredItems.length > 1) {
      const prevIndex = currentIndex === 0 ? featuredItems.length - 1 : currentIndex - 1;
      setCurrentIndex(prevIndex);
      setCurrentItem(featuredItems[prevIndex]);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    
    // Use postMessage to control YouTube player mute state without reloading
    if (videoRef.current && videoRef.current.contentWindow) {
      const command = isMuted ? '{"event":"command","func":"unMute","args":[]}' : '{"event":"command","func":"mute","args":[]}';
      videoRef.current.contentWindow.postMessage(command, 'https://www.youtube-nocookie.com');
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
    
    // Use postMessage to control YouTube player volume
    if (videoRef.current && videoRef.current.contentWindow) {
      const command = `{"event":"command","func":"setVolume","args":[${newVolume}]}`;
      videoRef.current.contentWindow.postMessage(command, 'https://www.youtube-nocookie.com');
    }
    
    // If volume is 0, mute the video, otherwise unmute
    if (newVolume === 0 && !isMuted) {
      setIsMuted(true);
      if (videoRef.current && videoRef.current.contentWindow) {
        const muteCommand = '{"event":"command","func":"mute","args":[]}';
        videoRef.current.contentWindow.postMessage(muteCommand, 'https://www.youtube-nocookie.com');
      }
    } else if (newVolume > 0 && isMuted) {
      setIsMuted(false);
      if (videoRef.current && videoRef.current.contentWindow) {
        const unmuteCommand = '{"event":"command","func":"unMute","args":[]}';
        videoRef.current.contentWindow.postMessage(unmuteCommand, 'https://www.youtube-nocookie.com');
      }
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
  const handleMovieSelect = (movie: MediaItem) => {
    // Convert the movie to MediaItem format and update currentItem
    const movieAsMediaItem = {
      ...movie,
      media_type: 'movie' as const
    };
    setCurrentItem(movieAsMediaItem);
    // Keep the modal open to show the new movie
  };

  if (!currentItem) {
    return (
      <div className="relative h-[70vh] bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Cargando contenido destacado...</div>
      </div>
    );
  }

  const mediaType = currentItem.media_type || (currentItem.title ? 'movie' : 'tv');
  const title = getTitle(currentItem);
  const year = getYear(getReleaseDate(currentItem));
  const backdropUrl = getImageUrl(currentItem.backdrop_path, 'original');

  return (
    <div className="relative h-[80vh] overflow-hidden group mt-24">
      {/* Background Image/Video */}
      <div className="absolute inset-0">
        {showVideo && trailer ? (
          <div className={`relative w-full h-full bg-black transition-opacity duration-75 ${
            visuallyHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}>
            <iframe
              ref={videoRef}
              src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&controls=0&showinfo=0&rel=0&iv_load_policy=3&modestbranding=1&playsinline=1&enablejsapi=1&disablekb=1&fs=0&cc_load_policy=0&end_screen=0&endscreen=0`}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen={false}
              style={{
                width: '177.78vh', // 16:9 aspect ratio based on height
                height: '100vh',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                minWidth: '100%',
                minHeight: '100%'
              }}
              onLoad={() => {
                 logger.log(`[${new Date().toLocaleTimeString()}] YouTube iframe loaded successfully`);
                 
                 // Wait a bit for the iframe to be fully ready before setting up communication
                 setTimeout(() => {
                   if (videoRef.current && videoRef.current.contentWindow) {
                     // Request video state updates from YouTube player
                     logger.log(`[${new Date().toLocaleTimeString()}] Setting up YouTube API communication for trailer: ${trailer.key}`);
                     
                     videoRef.current.contentWindow.postMessage(
                       '{"event":"listening","id":"' + trailer.key + '","channel":"widget"}',
                       'https://www.youtube-nocookie.com'
                     );
                     
                     logger.log(`[${new Date().toLocaleTimeString()}] Sent listening command to YouTube player`);
                     
                     // Listen for YouTube player state changes
                       const handleMessage = (event: MessageEvent) => {
                         if (event.origin !== 'https://www.youtube-nocookie.com') return;
                       
                       const timestamp = new Date().toLocaleTimeString();
                       logger.log(`[${timestamp}] Message received from YouTube:`, event.data);
                       
                       if (event.data && typeof event.data === 'string') {
                         try {
                           const data = JSON.parse(event.data);
                           logger.log(`[${timestamp}] Parsed YouTube data:`, data);
                           
                           // YouTube player state: 0 = ended, 1 = playing, 2 = paused, 3 = buffering, 5 = cued
                          if (data.event === 'onStateChange') {
                            logger.log(`[${timestamp}] YouTube state change detected: ${data.info}`);
                            
                            if (data.info === 0) {
                              // Video ended - immediately hide to prevent suggestions
                              logger.log(`[${timestamp}] Video ended naturally - hiding immediately to prevent suggestions`);
                              setVideoEnded(true);
                              hideVideoNow(); // Use instant hide solution
                            } else if (data.info === 1) {
                              logger.log(`[${timestamp}] Video started playing`);
                            } else if (data.info === 2) {
                              logger.log(`[${timestamp}] Video paused`);
                            }
                          }
                          
                          // NUEVO: También escuchar infoDelivery que sí funciona
                          if (data.event === 'infoDelivery' && data.info && data.info.playerState !== undefined) {
                            logger.log(`[${timestamp}] YouTube infoDelivery - playerState: ${data.info.playerState}`);
                            
                            if (data.info.playerState === 0) {
                              // Video ended via infoDelivery - immediately hide to prevent suggestions
                              logger.log(`[${timestamp}] Video ended (via infoDelivery) - hiding immediately to prevent suggestions`);
                              setVideoEnded(true);
                              hideVideoNow(); // Use instant hide solution
                            } else if (data.info.playerState === 1) {
                              logger.log(`[${timestamp}] Video playing (via infoDelivery)`);
                            }
                          }
                           
                           // También escuchar otros eventos de YouTube
                           if (data.event === 'onReady') {
                             logger.log(`[${timestamp}] YouTube player ready`);
                           }
                           
                         } catch (e) {
                           logger.log(`[${timestamp}] Error parsing YouTube message:`, e);
                         }
                       }
                     };
                     
                     // Remove any existing event listeners to prevent duplicates
                     window.removeEventListener('message', handleMessage);
                     window.addEventListener('message', handleMessage);
                   }
                 }, 1000); // Wait 1 second for iframe to be ready
               }}
            />
            
            {/* Gradientes de bordes para fusión suave */}
            {/* Borde izquierdo */}
            <div className="absolute left-0 top-0 w-32 h-full bg-gradient-to-r from-black via-black/90 via-black/70 to-transparent pointer-events-none z-10" />
            
            {/* Borde derecho */}
            <div className="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-black via-black/90 via-black/70 to-transparent pointer-events-none z-10" />
            
            {/* Gradiente ovalado central para mejor fusión */}
            <div className="absolute inset-0 pointer-events-none z-10" 
                 style={{
                   background: 'radial-gradient(ellipse 120% 80% at center, transparent 20%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.8) 70%, black 95%)'
                 }} />
            
            {/* Video overlay gradient principal */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent pointer-events-none z-5" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none z-5" />
          </div>
        ) : (
          <div className="relative w-full h-full">
            <Image
              src={backdropUrl}
              alt={title}
              fill
              className="object-cover"
              priority
            />
            {/* Image overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            
            {/* Gradiente ovalado central para mejor fusión */}
            <div className="absolute inset-0 pointer-events-none z-10" 
                 style={{
                   background: 'radial-gradient(ellipse 120% 80% at center, transparent 20%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.8) 70%, black 95%)'
                 }} />
          </div>
        )}
      </div>

      {/* Navigation Arrows */}
      {featuredItems.length > 1 && (
        <>
          <button
            onClick={navigateToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
          <button
            onClick={navigateToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          >
            <ChevronRightIcon className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Content */}
      <div className="absolute inset-0 flex items-center">
        <div className="container mx-auto px-4 z-10">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 drop-shadow-lg">
              {title}
            </h1>
            <p className="text-lg md:text-xl text-gray-200 mb-2 drop-shadow-md">
              {year}
            </p>
            <p className="text-base md:text-lg text-gray-300 mb-8 line-clamp-3 drop-shadow-md max-w-xl">
              {currentItem.overview}
            </p>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-4">
              <Link
                href={`/${mediaType}/${currentItem.id}`}
                className="inline-flex items-center gap-2 bg-gray-600/70 hover:bg-gray-600/90 text-white px-8 py-3 rounded-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                <PlayIcon className="w-5 h-5" />
                Watch now
              </Link>
              
              <button
                className="inline-flex items-center justify-center bg-gray-600/70 hover:bg-gray-600/90 text-white w-12 h-12 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl group/info"
                title="Más información"
                onClick={openInfoModal}
              >
                <InformationCircleIcon className="w-6 h-6" />
              </button>

              {/* Mute/Unmute Button with Volume Control - Only show when video is playing */}
              {showVideo && trailer && (
                <div 
                  className="relative"
                  onMouseEnter={handleVolumeMouseEnter}
                  onMouseLeave={handleVolumeMouseLeave}
                >
                  <button
                    onClick={toggleMute}
                    className="inline-flex items-center justify-center bg-gray-600/70 hover:bg-gray-600/90 text-white w-12 h-12 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl"
                    title={isMuted ? "Activar sonido" : "Silenciar"}
                  >
                    {isMuted ? (
                      <SpeakerXMarkIcon className="w-6 h-6" />
                    ) : (
                      <SpeakerWaveIcon className="w-6 h-6" />
                    )}
                  </button>
                  
                  {/* Volume Control Slider - Only show when not muted */}
                  {showVolumeControl && !isMuted && (
                    <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-gray-600/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={volume}
                          onChange={(e) => handleVolumeChange(Number(e.target.value))}
                          className="w-20 h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer slider"
                          style={{
                            background: `linear-gradient(to right, #ffffff 0%, #ffffff ${volume}%, #6b7280 ${volume}%, #6b7280 100%)`
                          }}
                        />
                        <span className="text-white text-sm font-medium min-w-[2rem]">
                          {volume}
                        </span>
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
         className="absolute top-8 right-4 z-30 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl backdrop-blur-sm"
         title={trailersEnabled ? "Deshabilitar trailers" : "Habilitar trailers"}
       >
         {trailersEnabled ? (
           <VideoCameraIcon className="w-6 h-6" />
         ) : (
           <VideoCameraSlashIcon className="w-6 h-6" />
         )}
       </button>

       {/* Indicators */}
       {featuredItems.length > 1 && (
         <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
           {featuredItems.map((_, index) => (
             <button
               key={index}
               onClick={() => {
                 setCurrentIndex(index);
                 setCurrentItem(featuredItems[index]);
               }}
               className={`w-2 h-2 rounded-full transition-all duration-300 ${
                 index === currentIndex 
                   ? 'bg-white scale-125' 
                   : 'bg-white/50 hover:bg-white/75'
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