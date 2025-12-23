'use client';

import { logger } from '@/lib/logger';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeftIcon } from '@heroicons/react/24/solid';
import { MediaItem, MovieDetails, TVShowDetails, TVShowExternalIds, Season } from '@/types/tmdb';
import { getImageUrl } from '@/lib/tmdb';
import { useTorrentSearch } from '@/hooks/useTorrentSearch';
import LoadingSpinner from './LoadingSpinner';

// ⚡ Lazy load del player
const StreamingPlayer = dynamic(() => import('./streaming/StreamingPlayer'), {
  loading: () => <LoadingSpinner />,
  ssr: false
});

type ViewMode = 'episode-selector' | 'torrents' | 'playing';

// Cache de IMDb IDs (persiste durante la sesión)
const imdbCache = new Map<string, string>();

interface MediaStreamingViewProps {
  item: MediaItem;
  details: MovieDetails | TVShowDetails | null;
  onBack?: () => void; // Para cerrar/volver (opcional, solo en modal)
  showBackButton?: boolean; // Si mostrar botón volver
}

export default function MediaStreamingView({
  item,
  details,
  onBack,
  showBackButton = false,
}: MediaStreamingViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);
  const [imdbId, setImdbId] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [seasonData, setSeasonData] = useState<Season | null>(null);
  const [loadingSeasonData, setLoadingSeasonData] = useState(false);
  const [selectedMagnet, setSelectedMagnet] = useState<string | null>(null);
  const [torrentError, setTorrentError] = useState<string | null>(null);

  const mediaType = item.media_type || (item.title ? 'movie' : 'tv');

  // Hook de búsqueda de torrents
  const { searchMovieTorrents, searchSeriesTorrents, torrents, isLoading: loadingTorrents } = useTorrentSearch({
    onError: (error) => setTorrentError(error),
  });

  // Fetch IMDb ID
  const fetchIMDbId = async () => {
    if (!item || !details) return;

    const cacheKey = `${mediaType}-${item.id}`;

    // Check cache first
    if (imdbCache.has(cacheKey)) {
      const cachedId = imdbCache.get(cacheKey)!;
      setImdbId(cachedId);
      logger.log(`📦 [IMDB_CACHE] Using cached IMDb ID: ${cachedId}`);
      return;
    }

    try {
      if (mediaType === 'movie') {
        const movieDetails = details as MovieDetails;
        if (movieDetails.imdb_id) {
          setImdbId(movieDetails.imdb_id);
          imdbCache.set(cacheKey, movieDetails.imdb_id);
          logger.log(`🎬 [IMDB] Movie IMDb ID: ${movieDetails.imdb_id}`);
        }
      } else {
        // Para series, necesitamos hacer un fetch adicional
        const response = await fetch(`/api/tv/${item.id}/external_ids`);
        if (response.ok) {
          const externalIds: TVShowExternalIds = await response.json();
          if (externalIds.imdb_id) {
            setImdbId(externalIds.imdb_id);
            imdbCache.set(cacheKey, externalIds.imdb_id);
            logger.log(`📺 [IMDB] TV IMDb ID: ${externalIds.imdb_id}`);
          }
        }
      }
    } catch (error) {
      logger.error('Error fetching IMDb ID:', error);
    }
  };

  // Fetch datos de temporada (para selector de episodios con miniaturas)
  const fetchSeasonData = async (season: number) => {
    if (!item || mediaType !== 'tv') return;

    setLoadingSeasonData(true);
    try {
      const response = await fetch(`/api/tv/${item.id}/season/${season}`);
      if (response.ok) {
        const data: Season = await response.json();
        setSeasonData(data);
        logger.log(`📺 [SEASON] Datos de temporada ${season} cargados:`, data.episodes.length, 'episodios');
      }
    } catch (error) {
      logger.error('Error fetching season data:', error);
    } finally {
      setLoadingSeasonData(false);
    }
  };

  // Manejar inicio de streaming
  const handleStartStreaming = async () => {
    if (!imdbId) {
      // Si no hay IMDb ID, mostrar mensaje más descriptivo y permitir continuar con título
      if (mediaType === 'tv') {
        const releaseYear = details && 'first_air_date' in details && details.first_air_date 
          ? new Date(details.first_air_date).getFullYear() 
          : undefined;
        
        setTorrentError(`Esta serie no tiene IMDb ID disponible (posiblemente es contenido futuro). Se intentará buscar usando el título.`);
        
        // Para series sin IMDb ID: mostrar selector de episodio de todas formas
        setViewMode('episode-selector');
        await fetchSeasonData(1);
        return;
      } else {
        const releaseYear = details && 'release_date' in details && details.release_date 
          ? new Date(details.release_date).getFullYear() 
          : undefined;
        
        setTorrentError(`Esta película no tiene IMDb ID disponible. Se intentará buscar usando el título.`);
        
        // Para películas sin IMDb ID: intentar buscar torrents por título
        setViewMode('torrents');
        const title = details && ('title' in details ? details.title : 'name' in details ? details.name : '') || '';
        await searchMovieTorrents(undefined, title, releaseYear); // Sin IMDb ID, usar título
        return;
      }
    }

    if (mediaType === 'movie') {
      // Para películas: buscar torrents directamente
      setViewMode('torrents');
      await searchMovieTorrents(imdbId);
    } else {
      // Para series: mostrar selector de episodio
      setViewMode('episode-selector');
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
      
      const title = details && ('title' in details ? details.title : 'name' in details ? details.name : '') || '';
      setTorrentError(`Buscando torrents usando título (sin IMDb ID): "${title}" S${selectedSeason}E${selectedEpisode}`);
      
      setViewMode('torrents');
      await searchSeriesTorrents(undefined, selectedSeason, selectedEpisode, title, releaseYear); // Sin IMDb ID, usar título
      return;
    }

    setViewMode('torrents');
    await searchSeriesTorrents(imdbId, selectedSeason, selectedEpisode);
  };

  // Seleccionar torrent y empezar a reproducir
  const handleSelectTorrent = (magnetUri: string) => {
    setSelectedMagnet(magnetUri);
    setViewMode('playing');
  };

  // Volver a la vista anterior
  const handleBackInternal = () => {
    if (viewMode === 'playing') {
      setViewMode('torrents');
      setSelectedMagnet(null);
    } else if (viewMode === 'torrents') {
      setViewMode(mediaType === 'tv' ? 'episode-selector' : null);
    } else if (viewMode === 'episode-selector') {
      setViewMode(null);
    }
  };

  // useEffect para fetch IMDb ID cuando se carga el componente
  useEffect(() => {
    if (details && !imdbId) {
      fetchIMDbId();
    }
  }, [details]);

  // useEffect para iniciar el flujo de streaming automáticamente
  useEffect(() => {
    if (imdbId && !viewMode) {
      handleStartStreaming();
    }
  }, [imdbId, viewMode]);

  return (
    <div className="relative w-full h-full">
      {/* Botón volver */}
      {showBackButton && (
        <button
          onClick={() => {
            if (viewMode && viewMode !== 'playing') {
              handleBackInternal();
            } else {
              onBack?.();
            }
          }}
          className="absolute top-4 left-4 bg-black/50 hover:bg-black/70 text-white px-4 py-2 rounded-full transition-all duration-200 flex items-center gap-2 z-50"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          <span className="font-medium">Volver</span>
        </button>
      )}

      {/* Vista: Selector de episodios */}
      {viewMode === 'episode-selector' && (
        <div className="p-6 space-y-6">
          <h2 className="text-2xl font-bold text-white">Seleccionar Episodio</h2>

          {/* Selector de temporada */}
          {details && 'number_of_seasons' in details && (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: details.number_of_seasons }, (_, i) => i + 1).map((season) => (
                <button
                  key={season}
                  onClick={() => {
                    setSelectedSeason(season);
                    fetchSeasonData(season);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    selectedSeason === season
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Temporada {season}
                </button>
              ))}
            </div>
          )}

          {/* Lista de episodios */}
          {loadingSeasonData ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
          ) : seasonData && seasonData.episodes.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {seasonData.episodes.map((episode) => (
                <button
                  key={episode.id}
                  onClick={() => setSelectedEpisode(episode.episode_number)}
                  className={`relative group rounded-lg overflow-hidden transition-all ${
                    selectedEpisode === episode.episode_number
                      ? 'ring-4 ring-blue-500'
                      : 'hover:ring-2 hover:ring-white/50'
                  }`}
                >
                  {/* Thumbnail del episodio */}
                  <div className="aspect-video bg-gray-800 relative">
                    {episode.still_path ? (
                      <img
                        src={getImageUrl(episode.still_path, 'w342')}
                        alt={episode.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500">
                        Sin imagen
                      </div>
                    )}

                    {/* Checkmark si está seleccionado */}
                    {selectedEpisode === episode.episode_number && (
                      <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info del episodio */}
                  <div className="p-3 bg-gray-900">
                    <div className="text-white font-semibold text-sm mb-1">
                      Episodio {episode.episode_number}
                    </div>
                    <div className="text-gray-400 text-xs line-clamp-2">{episode.name}</div>
                    {episode.runtime && (
                      <div className="text-gray-500 text-xs mt-1">{episode.runtime} min</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-12">
              No hay episodios disponibles para esta temporada
            </div>
          )}

          {/* Botón buscar torrents */}
          {seasonData && seasonData.episodes.length > 0 && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleSearchSeriesTorrents}
                disabled={loadingTorrents}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-8 py-3 rounded-lg font-semibold transition-all"
              >
                {loadingTorrents ? 'Buscando...' : 'Buscar Torrents'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Vista: Lista de torrents */}
      {viewMode === 'torrents' && (
        <div className="p-6 space-y-6">
          <h2 className="text-2xl font-bold text-white">Seleccionar Torrent</h2>

          {torrentError && (
            <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg">
              {torrentError}
            </div>
          )}

          {loadingTorrents ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
          ) : torrents.length > 0 ? (
            <div className="space-y-3">
              {torrents.map((torrent, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectTorrent(torrent.magnetUri)}
                  className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-left transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-white font-semibold mb-1 group-hover:text-blue-400 transition-colors">
                        {torrent.title}
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-gray-400">
                        {torrent.quality && (
                          <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded">
                            {torrent.quality}
                          </span>
                        )}
                        {torrent.size && <span>📦 {torrent.size}</span>}
                        {torrent.seeds !== undefined && (
                          <span className={torrent.seeds > 10 ? 'text-green-400' : 'text-yellow-400'}>
                            🌱 {torrent.seeds} seeds
                          </span>
                        )}
                        {torrent.source && (
                          <span className="text-gray-500">{torrent.source}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-12">
              No se encontraron torrents. Intenta con otro contenido.
            </div>
          )}
        </div>
      )}

      {/* Vista: Reproduciendo */}
      {viewMode === 'playing' && selectedMagnet && (
        <StreamingPlayer
          magnetUri={selectedMagnet}
          movieMetadata={{
            tmdbId: item.id, // ✅ Mantener tmdbId como número para que se guarde correctamente en la base de datos
            title:
              mediaType === 'movie'
                ? `${item.title || item.name} (${new Date(item.release_date || item.first_air_date || '').getFullYear()})`
                : `${item.name} S${selectedSeason}E${selectedEpisode}`,
            imdbId: imdbId || undefined,
            season: mediaType === 'tv' ? selectedSeason : undefined,
            episode: mediaType === 'tv' ? selectedEpisode : undefined,
            backdropPath: item.backdrop_path ? getImageUrl(item.backdrop_path, 'original') : undefined,
          }}
          isModalPlayer={showBackButton} // Si hay botón back, es modal
          onError={(error) => {
            setTorrentError(error);
            setViewMode('torrents');
          }}
        />
      )}
    </div>
  );
}

