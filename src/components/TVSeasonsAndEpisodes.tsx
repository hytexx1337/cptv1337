'use client';

import { useState, useEffect } from 'react';
import { ChevronDownIcon, PlayIcon, PlusIcon } from '@heroicons/react/24/solid';
import { Season, Episode } from '@/types/tmdb';
import { getImageUrl } from '@/lib/tmdb';
import { logger } from '@/lib/logger';
import { AniListAnime, generateEpisodesFromAniList, cleanAniListDescription, searchAniListByTitleAndSeason } from '@/lib/anilist-service';

interface TVSeasonsAndEpisodesProps {
  tvId: number;
  totalSeasons: number;
  onEpisodeClick?: (season: number, episode: number) => void;
  isAnime?: boolean;
  tvShowName?: string;
  tvShowPoster?: string | null;
  tvShowAirDate?: string;
  tvShowVoteAverage?: number;
}

export default function TVSeasonsAndEpisodes({ 
  tvId, 
  totalSeasons, 
  onEpisodeClick,
  isAnime = false,
  tvShowName,
  tvShowPoster,
  tvShowAirDate,
  tvShowVoteAverage
}: TVSeasonsAndEpisodesProps) {
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonData, setSeasonData] = useState<Season | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Generar array de temporadas disponibles
  const availableSeasons = Array.from({ length: totalSeasons }, (_, i) => i + 1);

  // Función para obtener datos de una temporada específica (AniList o TMDB)
  const fetchSeasonData = async (seasonNumber: number) => {
    setLoading(true);
    try {
      // Si es anime, buscar la temporada específica en AniList
      if (isAnime && tvShowName) {
        logger.log(`🔍 [TVSeasonsAndEpisodes] Buscando temporada ${seasonNumber}:`, tvShowName);
        const seasonAnimeData = await searchAniListByTitleAndSeason(tvShowName, seasonNumber);
        
        if (seasonAnimeData) {
          logger.log(`✅ [TVSeasonsAndEpisodes] Temporada ${seasonNumber} encontrada:`, seasonAnimeData.title.romaji);
          const episodes = generateEpisodesFromAniList(seasonAnimeData);
          setSeasonData({
            id: tvId,
            season_number: seasonNumber,
            name: `Season ${seasonNumber}`,
            overview: cleanAniListDescription(seasonAnimeData.description) || '',
            poster_path: tvShowPoster || null,
            air_date: tvShowAirDate || '',
            episode_count: episodes.length,
            vote_average: seasonAnimeData.averageScore ? seasonAnimeData.averageScore / 10 : tvShowVoteAverage || 0,
            episodes: episodes,
          });
        } else {
          logger.warn(`⚠️ [TVSeasonsAndEpisodes] Temporada ${seasonNumber} no encontrada, usando TMDB`);
          // Fallback a TMDB
          const response = await fetch(`/api/tv/${tvId}/season/${seasonNumber}`);
          if (response.ok) {
            const data = await response.json();
            setSeasonData(data);
          } else {
            logger.error('Error fetching season data');
            setSeasonData(null);
          }
        }
      } else {
        // Usar TMDB normalmente
        const response = await fetch(`/api/tv/${tvId}/season/${seasonNumber}`);
        if (response.ok) {
          const data = await response.json();
          setSeasonData(data);
        } else {
          logger.error('Error fetching season data');
          setSeasonData(null);
        }
      }
    } catch (error) {
      logger.error('Error fetching season data:', error);
      setSeasonData(null);
    } finally {
      setLoading(false);
    }
  };

  // Cargar datos de la temporada seleccionada
  useEffect(() => {
    fetchSeasonData(selectedSeason);
  }, [selectedSeason, tvId]);

  // Función para formatear duración
  const formatRuntime = (runtime: number | null) => {
    if (!runtime) return '';
    const hours = Math.floor(runtime / 60);
    const minutes = runtime % 60;
    
    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${minutes}m`;
    }
  };

  // Función para formatear fecha
  const formatAirDate = (airDate: string) => {
    if (!airDate) return '';
    return new Date(airDate).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="mt-6 sm:mt-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-lg sm:text-xl">Episodios</h3>
        
        {/* Selector de temporada estilo Netflix */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-md border border-white/20 transition-colors duration-200"
          >
            <span className="text-sm font-medium">
              Temporada {selectedSeason}
            </span>
            <ChevronDownIcon 
              className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} 
            />
          </button>

          {/* Dropdown de temporadas */}
          {isDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 bg-black border border-white/20 rounded-md shadow-lg z-50 min-w-[140px]">
              {availableSeasons.map((season) => (
                <button
                  key={season}
                  onClick={() => {
                    setSelectedSeason(season);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors duration-200 ${
                    selectedSeason === season ? 'bg-white/10 text-white' : 'text-gray-300'
                  }`}
                >
                  Temporada {season}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lista de episodios */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      ) : seasonData && seasonData.episodes ? (
        <div className="space-y-3">
          {seasonData.episodes.map((episode: Episode, index: number) => (
            <div
              key={episode.id}
              onClick={() => onEpisodeClick?.(selectedSeason, episode.episode_number)}
              className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors duration-200 group/episode cursor-pointer border border-white/10"
            >
              <div className="flex gap-4">
                {/* Número del episodio y thumbnail */}
                <div className="flex-shrink-0 relative">
                  <div className="w-32 h-18 bg-black/50 rounded flex items-center justify-center relative overflow-hidden">
                    {episode.still_path ? (
                      <img
                        src={getImageUrl(episode.still_path, 'w342')}
                        alt={`Episodio ${episode.episode_number}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-400 text-xs font-bold">
                        {episode.episode_number}
                      </span>
                    )}
                    
                    {/* Botón de play con opacidad fija */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-8 h-8 bg-black/50 rounded-full flex items-center justify-center">
                        <PlayIcon className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Información del episodio */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-gray-400 text-sm font-medium">
                          {episode.episode_number}.
                        </span>
                        <h4 className="text-white font-medium text-sm truncate">
                          {episode.name}
                        </h4>
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                        {episode.runtime && (
                          <span>{formatRuntime(episode.runtime)}</span>
                        )}
                        {episode.air_date && (
                          <>
                            {episode.runtime && <span>•</span>}
                            <span>{formatAirDate(episode.air_date)}</span>
                          </>
                        )}
                      </div>
                      
                      {episode.overview && (
                        <p className="text-gray-300 text-xs leading-relaxed line-clamp-2">
                          {episode.overview}
                        </p>
                      )}
                    </div>

                    {/* Botones de acción */}
                    <div className="flex items-center gap-2 opacity-0 group-hover/episode:opacity-100 transition-opacity duration-200">
                      <button className="p-1.5 rounded-full border border-gray-600 hover:border-white transition-colors duration-200">
                        <PlusIcon className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-300 text-sm">
            No se pudieron cargar los episodios de esta temporada.
          </p>
        </div>
      )}
    </div>
  );
}