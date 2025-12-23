'use client';

import { logger } from '@/lib/logger';
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { getImageUrl } from '@/lib/tmdb';
import { watchHistory } from '@/lib/watch-history';
import type { Episode, Season } from '@/types/tmdb';

interface EpisodeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  tmdbId: number;
  currentSeason: number;
  currentEpisode: number;
  onEpisodeSelect: (season: number, episode: number, episodeData: Episode) => void;
  onSeasonChange?: (season: number) => void;
}

const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
  isOpen,
  onClose,
  tmdbId,
  currentSeason,
  currentEpisode,
  onEpisodeSelect,
  onSeasonChange
}) => {
  const [seasonData, setSeasonData] = useState<Season | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(currentSeason);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Función para obtener el contenedor de destino del portal
  const getPortalTarget = () => {
    // Buscar el elemento del reproductor Video.js
    const videoJsPlayer = document.querySelector('.video-js');
    
    if (videoJsPlayer) {
      // Verificar si Video.js está en pantalla completa
      // Video.js agrega la clase 'vjs-fullscreen' cuando está en fullscreen
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

  useEffect(() => {
    if (isOpen && tmdbId) {
      fetchTVShowData();
    }
  }, [isOpen, tmdbId]);

  useEffect(() => {
    if (isOpen && tmdbId && selectedSeason) {
      fetchSeasonData();
    }
  }, [isOpen, tmdbId, selectedSeason]);

  // Sincronizar selectedSeason con currentSeason cuando cambie
  useEffect(() => {
    setSelectedSeason(currentSeason);
  }, [currentSeason]);

  // Hacer scroll al episodio actual cuando se abre el modal o cambian los episodios
  useEffect(() => {
    if (isOpen && seasonData?.episodes && currentEpisode && selectedSeason === currentSeason) {
      // Esperar un tick para que el DOM se renderice
      setTimeout(() => {
        const episodeElements = document.querySelectorAll('.episode-list-item');
        const currentEpisodeElement = Array.from(episodeElements).find((el) => {
          const episodeNum = el.getAttribute('data-episode-number');
          return episodeNum && parseInt(episodeNum) === currentEpisode;
        });

        if (currentEpisodeElement) {
          currentEpisodeElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
          logger.log('🎯 [EPISODE-SELECTOR] Scroll al episodio actual:', currentEpisode);
        }
      }, 100);
    }
  }, [isOpen, seasonData?.episodes, currentEpisode, selectedSeason, currentSeason]);

  const fetchTVShowData = async () => {
    try {
      const response = await fetch(`/api/tv/${tmdbId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch TV show data');
      }
      
      const data = await response.json();
      const seasons = data.seasons
        ?.filter((season: any) => season.season_number > 0)
        ?.map((season: any) => season.season_number)
        ?.sort((a: number, b: number) => a - b) || [];
      
      setAvailableSeasons(seasons);
    } catch (err) {
      logger.error('Error fetching TV show data:', err);
    }
  };

  const fetchSeasonData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/tv/${tmdbId}/season/${selectedSeason}`);
      if (!response.ok) {
        throw new Error('Failed to fetch season data');
      }
      
      const data = await response.json();
      setSeasonData(data);
    } catch (err) {
      logger.error('Error fetching season data:', err);
      setError('Error al cargar los episodios');
    } finally {
      setLoading(false);
    }
  };

  const handleEpisodeClick = (episode: Episode) => {
    onEpisodeSelect(selectedSeason, episode.episode_number, episode);
    onClose();
  };

  const formatRuntime = (runtime: number | null) => {
    if (!runtime) return '';
    const hours = Math.floor(runtime / 60);
    const minutes = runtime % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const formatAirDate = (airDate: string) => {
    if (!airDate) return '';
    return new Date(airDate).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Cerrar siempre cuando se hace click en el backdrop
    onClose();
  };

  if (!isOpen) return null;

  // Verificar si Video.js está en pantalla completa
  const videoJsPlayer = document.querySelector('.video-js');
  const isVideoJsFullscreen = videoJsPlayer?.classList.contains('vjs-fullscreen') || false;

  return ReactDOM.createPortal(
    <div 
      className={`${isVideoJsFullscreen ? 'absolute' : 'fixed'} inset-0 z-[2100] flex items-end justify-end`}
      onClick={handleBackdropClick}
      style={{ pointerEvents: 'auto', background: 'transparent' }}
    >
      <div 
        className="bg-black/95 backdrop-blur-md"
        style={{
          width: '420px',
          maxHeight: '60vh',
          marginBottom: '100px',
          marginRight: '20px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
      <div className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
        {/* Header with Season Selector */}
        <div className="mb-3">
          <div className="relative">
            <select
              value={selectedSeason}
              onChange={(e) => {
                e.stopPropagation();
                const newSeason = parseInt(e.target.value);
                setSelectedSeason(newSeason);
                if (onSeasonChange) {
                  onSeasonChange(newSeason);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-black text-white pl-4 pr-10 py-2.5 rounded-lg border border-gray-700/50 focus:border-red-500 focus:outline-none appearance-none cursor-pointer w-full text-base font-semibold z-[2110] relative"
            >
              {availableSeasons.length > 0 ? (
                availableSeasons.map((seasonNum) => (
                  <option key={seasonNum} value={seasonNum}>
                    Temporada {seasonNum}
                  </option>
                ))
              ) : (
                Array.from({ length: 10 }, (_, i) => i + 1).map((seasonNum) => (
                  <option key={seasonNum} value={seasonNum}>
                    Temporada {seasonNum}
                  </option>
                ))
              )}
            </select>
            {/* Custom dropdown arrow */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

         {loading && (
           <div className="flex items-center justify-center h-32">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
           </div>
         )}

         {error && (
           <div className="text-center text-red-400 py-8">
             {error}
           </div>
         )}

         {seasonData && seasonData.episodes && (
           <div 
             className="overflow-y-auto space-y-2" 
             style={{ maxHeight: 'calc(60vh - 80px)', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.3) transparent' }}
           >
             {seasonData.episodes.map((episode) => {
               const watchData = watchHistory.getProgress('tv', tmdbId.toString(), selectedSeason, episode.episode_number);
               const progressPercent = watchData ? Math.round(watchData.progress) : 0;
               const isCurrentEpisode = episode.episode_number === currentEpisode && selectedSeason === currentSeason;

               return (
                 <div
                   key={episode.id}
                   className={`episode-list-item flex gap-4 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                     isCurrentEpisode 
                       ? 'bg-black border border-red-600' 
                       : 'hover:bg-black/50'
                   }`}
                   data-episode-number={episode.episode_number}
                   onClick={(e) => {
                     e.stopPropagation();
                     handleEpisodeClick(episode);
                   }}
                 >
                   {/* Episode Thumbnail */}
                   <div className="relative flex-shrink-0" style={{ width: '160px', height: '90px' }}>
                     <div className="w-full h-full rounded-md overflow-hidden bg-gray-800">
                       {episode.still_path ? (
                         <img
                           src={getImageUrl(episode.still_path, 'w342')}
                           alt={`Episode ${episode.episode_number}`}
                           className="w-full h-full object-cover"
                         />
                       ) : (
                         <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                           <span className="text-2xl font-bold text-white">{episode.episode_number}</span>
                         </div>
                       )}
                     </div>
                     
                     {/* Progress Bar */}
                     {progressPercent > 0 && (
                       <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                         <div 
                           className="bg-red-600 h-full transition-all duration-300"
                           style={{ width: `${progressPercent}%` }}
                         />
                       </div>
                     )}
                   </div>

                   {/* Episode Info */}
                   <div className="flex-1 min-w-0">
                     <div className="flex items-start justify-between gap-2 mb-1">
                       <h3 className="text-white font-semibold text-sm line-clamp-1">
                         {episode.episode_number}. {episode.name}
                       </h3>
                       {isCurrentEpisode && (
                         <span className="text-red-500 text-xs font-bold whitespace-nowrap">VIENDO</span>
                       )}
                       {progressPercent >= 90 && !isCurrentEpisode && (
                         <span className="text-green-500 text-xs font-bold whitespace-nowrap">VISTO</span>
                       )}
                     </div>
                     
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                      {episode.runtime && <span key="runtime">{formatRuntime(episode.runtime)}</span>}
                      {episode.vote_average > 0 && (
                        <React.Fragment key="rating">
                          {episode.runtime && <span key="separator">•</span>}
                          <span key="vote" className="flex items-center gap-1">
                            <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                            {episode.vote_average.toFixed(1)}
                          </span>
                        </React.Fragment>
                      )}
                    </div>
                     
                     {episode.overview && (
                       <p className="text-gray-400 text-xs line-clamp-2 leading-relaxed">
                         {episode.overview}
                       </p>
                     )}
                   </div>
                 </div>
               );
             })}
           </div>
         )}
       </div>
      </div>
    </div>,
    getPortalTarget()
  );
};

export default EpisodeSelector;