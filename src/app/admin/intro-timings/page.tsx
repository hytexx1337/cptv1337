'use client';

import { logger } from '@/lib/logger';
import { useState, useEffect, useRef } from 'react';
import { MagnifyingGlassIcon, DocumentCheckIcon, PencilIcon, ClockIcon, PlayIcon, PauseIcon, XMarkIcon } from '@heroicons/react/24/solid';
import dynamic from 'next/dynamic';

const StreamingPlayer = dynamic(() => import('@/components/streaming/StreamingPlayer'), { ssr: false });

interface IntroTiming {
  intro_start?: number;
  intro_end?: number;
  credits_start?: number;
  credits_end?: number;
}

interface Episode {
  episode_number: number;
  name: string;
  air_date: string;
}

interface Season {
  season_number: number;
  episodes: Episode[];
}

interface TVShow {
  id: number;
  name: string;
  first_air_date: string;
  poster_path: string;
  seasons: Season[];
  external_ids?: {
    imdb_id?: string;
  };
}

interface IntroTimingsData {
  [seriesKey: string]: {
    tmdbId: number;
    title: string;
    seasons: {
      [seasonNumber: string]: {
        episodes: {
          [episodeNumber: string]: {
            intro?: {
              start: number;
              end: number;
            };
            credits?: {
              start: number;
              end: number;
            };
          };
        };
      };
    };
  };
}

export default function AdminIntroTimingsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TVShow[]>([]);
  const [selectedShow, setSelectedShow] = useState<TVShow | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);
  const [introTimings, setIntroTimings] = useState<IntroTimingsData>({});
  const [currentTimings, setCurrentTimings] = useState<IntroTiming>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  // Estados para los inputs de tiempo (como texto)
  const [introStartText, setIntroStartText] = useState('');
  const [introDurationText, setIntroDurationText] = useState('');
  const [creditsStartText, setCreditsStartText] = useState('');
  const [creditsEndText, setCreditsEndText] = useState('');
  
  // Estados para el reproductor
  const [showPlayer, setShowPlayer] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const playerRef = useRef<any>(null);

  // Cargar datos existentes de intro-timings
  useEffect(() => {
    loadIntroTimings();
  }, []);

  // Cargar tiempos existentes cuando se selecciona un episodio
  useEffect(() => {
    if (selectedShow && selectedSeason && selectedEpisode) {
      const seriesKey = selectedShow.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const episodeTimings = introTimings[seriesKey]?.seasons?.[selectedSeason.toString()]?.episodes?.[selectedEpisode.toString()];
      
      if (episodeTimings) {
        setCurrentTimings({
          intro_start: episodeTimings.intro?.start || 0,
          intro_end: episodeTimings.intro?.end || 0,
          credits_start: episodeTimings.credits?.start || 0,
          credits_end: episodeTimings.credits?.end || 0,
        });
        // Actualizar los textos de los inputs
        setIntroStartText(episodeTimings.intro?.start ? formatTime(episodeTimings.intro.start) : '');
        const introDuration = episodeTimings.intro?.end && episodeTimings.intro?.start 
          ? episodeTimings.intro.end - episodeTimings.intro.start 
          : 0;
        setIntroDurationText(introDuration ? formatTime(introDuration) : '');
        setCreditsStartText(episodeTimings.credits?.start ? formatTime(episodeTimings.credits.start) : '');
        setCreditsEndText(episodeTimings.credits?.end ? formatTime(episodeTimings.credits.end) : '');
      } else {
        setCurrentTimings({
          intro_start: 0,
          intro_end: 0,
          credits_start: 0,
          credits_end: 0,
        });
        // Limpiar los textos
        setIntroStartText('');
        setIntroDurationText('');
        setCreditsStartText('');
        setCreditsEndText('');
      }
    }
  }, [selectedShow, selectedSeason, selectedEpisode, introTimings]);

  const loadIntroTimings = async () => {
    try {
      const response = await fetch('/api/intro-timings');
      if (response.ok) {
        const data = await response.json();
        setIntroTimings(data);
      }
    } catch (error) {
      logger.error('Error loading intro timings:', error);
    }
  };

  const searchShows = async () => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/search/tv?query=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results || []);
      }
    } catch (error) {
      logger.error('Error searching shows:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectShow = async (show: TVShow) => {
    setIsLoading(true);
    try {
      // Obtener detalles completos de la serie incluyendo temporadas y external_ids
      const response = await fetch(`/api/tv/${show.id}`);
      if (response.ok) {
        const detailedShow = await response.json();
        
        // Obtener external_ids si no vienen en los detalles
        if (!detailedShow.external_ids?.imdb_id) {
          const externalIdsResponse = await fetch(`/api/tv/${show.id}/external_ids`);
          if (externalIdsResponse.ok) {
            const externalIds = await externalIdsResponse.json();
            detailedShow.external_ids = externalIds;
          }
        }
        
        setSelectedShow(detailedShow);
        setSelectedSeason(1);
        setSelectedEpisode(1);
        setSearchResults([]);
        setSearchQuery('');
      }
    } catch (error) {
      logger.error('Error fetching show details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveTimings = async () => {
    if (!selectedShow) return;

    setIsSaving(true);
    try {
      // Cargar los datos existentes
      const response = await fetch('/api/intro-timings');
      const existingData = response.ok ? await response.json() : {};
      
      // Crear la clave de la serie (usar nombre en minúsculas con guiones)
      const seriesKey = selectedShow.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      // Crear la estructura correcta
      if (!existingData[seriesKey]) {
        existingData[seriesKey] = {
          tmdbId: selectedShow.id,
          title: selectedShow.name,
          seasons: {}
        };
      }
      
      if (!existingData[seriesKey].seasons[selectedSeason.toString()]) {
        existingData[seriesKey].seasons[selectedSeason.toString()] = {
          episodes: {}
        };
      }
      
      // Guardar los tiempos en el formato correcto
      existingData[seriesKey].seasons[selectedSeason.toString()].episodes[selectedEpisode.toString()] = {
        intro: {
          start: currentTimings.intro_start,
          end: currentTimings.intro_end
        },
        credits: {
          start: currentTimings.credits_start,
          end: currentTimings.credits_end
        }
      };

      const saveResponse = await fetch('/api/intro-timings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(existingData),
      });

      if (saveResponse.ok) {
        setMessage('Tiempos guardados correctamente');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Error al guardar los tiempos');
      }
    } catch (error) {
      logger.error('Error saving timings:', error);
      setMessage('Error al guardar los tiempos');
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const parseTime = (timeString: string): number => {
    const [mins, secs] = timeString.split(':').map(Number);
    return (mins || 0) * 60 + (secs || 0);
  };

  // Marcar tiempo actual del reproductor
  const markIntroStart = () => {
    const time = Math.floor(playerCurrentTime);
    setIntroStartText(formatTime(time));
    setCurrentTimings(prev => ({ ...prev, intro_start: time }));
    
    // Recalcular el fin si hay duración
    if (introDurationText) {
      const duration = parseTime(introDurationText);
      const end = time + duration;
      setCurrentTimings(prev => ({ ...prev, intro_end: end }));
    }
  };

  const markCreditsStart = () => {
    const time = Math.floor(playerCurrentTime);
    setCreditsStartText(formatTime(time));
    setCurrentTimings(prev => ({ ...prev, credits_start: time }));
  };

  const markCreditsEnd = () => {
    const time = Math.floor(playerCurrentTime);
    setCreditsEndText(formatTime(time));
    setCurrentTimings(prev => ({ ...prev, credits_end: time }));
  };

  const loadEpisodeForPreview = async () => {
    if (!selectedShow) return;
    
    const imdbId = selectedShow.external_ids?.imdb_id;
    if (!imdbId) {
      setMessage('Error: No se encontró el IMDB ID de la serie');
      return;
    }
    
    setIsLoading(true);
    setMessage('');
    try {
      // Usar el mismo endpoint que la página real
      const res = await fetch(
        `/api/hls-browser-proxy/start?type=tv&id=${encodeURIComponent(imdbId)}&season=${selectedSeason}&episode=${selectedEpisode}`
      );
      const data = await res.json();
      
      if (res.ok && data?.playlistUrl) {
        setStreamUrl(data.playlistUrl);
        setShowPlayer(true);
        logger.log('✅ [ADMIN] Video cargado correctamente:', data.playlistUrl);
      } else {
        setMessage('Error al cargar el video. Intenta con otro episodio.');
        logger.error('Error en la respuesta del proxy:', data);
      }
    } catch (error) {
      logger.error('Error loading episode:', error);
      setMessage('Error al cargar el episodio');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <PencilIcon className="w-8 h-8" />
          Panel de Administración - Tiempos de Intro
        </h1>

        {/* Búsqueda de series */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Buscar Serie</h2>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchShows()}
                placeholder="Buscar serie por nombre..."
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={searchShows}
              disabled={isLoading || !searchQuery.trim()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition-colors"
            >
              {isLoading ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {/* Resultados de búsqueda */}
          {searchResults.length > 0 && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((show) => (
                <div
                  key={show.id}
                  onClick={() => selectShow(show)}
                  className="bg-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-600 transition-colors"
                >
                  <div className="flex gap-3">
                    {show.poster_path && (
                      <img
                        src={`https://image.tmdb.org/t/p/w92${show.poster_path}`}
                        alt={show.name}
                        className="w-16 h-24 object-cover rounded"
                      />
                    )}
                    <div>
                      <h3 className="font-semibold">{show.name}</h3>
                      <p className="text-sm text-gray-400">{show.first_air_date}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Editor de tiempos */}
        {selectedShow && (
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
              {selectedShow.poster_path && (
                <img
                  src={`https://image.tmdb.org/t/p/w92${selectedShow.poster_path}`}
                  alt={selectedShow.name}
                  className="w-16 h-24 object-cover rounded"
                />
              )}
              <div>
                <h2 className="text-2xl font-semibold">{selectedShow.name}</h2>
                <p className="text-gray-400">{selectedShow.first_air_date}</p>
              </div>
            </div>
              
              <button
                onClick={loadEpisodeForPreview}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg transition-colors"
              >
                <PlayIcon className="w-5 h-5" />
                {isLoading ? 'Cargando...' : showPlayer ? 'Recargar Video' : 'Cargar Video'}
              </button>
            </div>

            {/* Reproductor */}
            {showPlayer && streamUrl && (
              <div className="mb-6 relative">
                <button
                  onClick={() => {
                    setShowPlayer(false);
                    setStreamUrl(null);
                  }}
                  className="absolute top-2 right-2 z-10 p-2 bg-red-600 hover:bg-red-700 rounded-full transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
                <div className="bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <StreamingPlayer
                    directStreamUrl={streamUrl}
                    movieMetadata={{
                      tmdbId: selectedShow.id,
                      imdbId: '',
                      title: `${selectedShow.name} S${selectedSeason}E${selectedEpisode}`,
                      year: selectedShow.first_air_date?.split('-')[0] || '',
                      backdropPath: selectedShow.poster_path ? `https://image.tmdb.org/t/p/original${selectedShow.poster_path}` : '',
                      logoPath: '',
                      season: selectedSeason,
                      episode: selectedEpisode,
                      overview: '',
                    }}
                    isModalPlayer={false}
                    onTimeUpdate={(time) => setPlayerCurrentTime(time)}
                    onError={(error) => {
                      logger.error('Player error:', error);
                      setMessage('Error al reproducir el video');
                    }}
                  />
                </div>
                <div className="mt-2 text-center text-sm text-gray-400">
                  Tiempo actual: <span className="font-mono font-bold text-white">{formatTime(playerCurrentTime)}</span>
                </div>
              </div>
            )}

            {/* Selectores de temporada y episodio */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2">Temporada</label>
                <select
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(Number(e.target.value))}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  {selectedShow.seasons?.map((season) => (
                    <option key={season.season_number} value={season.season_number}>
                      Temporada {season.season_number}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Episodio</label>
                <select
                  value={selectedEpisode}
                  onChange={(e) => setSelectedEpisode(Number(e.target.value))}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  {selectedShow.seasons?.find(s => s.season_number === selectedSeason)?.episodes?.map((episode) => (
                    <option key={episode.episode_number} value={episode.episode_number}>
                      {episode.episode_number}. {episode.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Campos de tiempo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <PlayIcon className="w-5 h-5" />
                  Intro - Saltará de inicio a fin
                </h3>
                <div>
                  <label className="block text-sm font-medium mb-2">Inicio (mm:ss)</label>
                  <div className="flex gap-2">
                  <input
                    type="text"
                      placeholder="0:05"
                      value={introStartText}
                      onChange={(e) => setIntroStartText(e.target.value)}
                      onBlur={(e) => {
                      const time = parseTime(e.target.value);
                      setCurrentTimings(prev => ({ ...prev, intro_start: time || undefined }));
                        setIntroStartText(time ? formatTime(time) : '');
                        
                        // Recalcular el fin si hay duración
                        if (introDurationText) {
                          const duration = parseTime(introDurationText);
                          const end = time + duration;
                          setCurrentTimings(prev => ({ ...prev, intro_end: end }));
                        }
                    }}
                      className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                    <button
                      onClick={markIntroStart}
                      disabled={!showPlayer}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Marcar inicio
                    </button>
                    <button
                      onClick={() => {
                        setIntroStartText('');
                        setIntroDurationText('');
                        setCurrentTimings(prev => ({ ...prev, intro_start: undefined, intro_end: undefined }));
                      }}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Duración de la intro (mm:ss)</label>
                  <input
                    type="text"
                    placeholder="1:30"
                    value={introDurationText}
                    onChange={(e) => setIntroDurationText(e.target.value)}
                    onBlur={(e) => {
                      const duration = parseTime(e.target.value);
                      if (duration && currentTimings.intro_start) {
                        const end = currentTimings.intro_start + duration;
                        setCurrentTimings(prev => ({ ...prev, intro_end: end }));
                        setIntroDurationText(formatTime(duration));
                      } else {
                        setIntroDurationText('');
                      }
                    }}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                  {currentTimings.intro_start && currentTimings.intro_end && (
                    <p className="mt-2 text-sm text-green-400">
                      ✓ Saltará desde <span className="font-mono">{formatTime(currentTimings.intro_start)}</span> hasta <span className="font-mono">{formatTime(currentTimings.intro_end)}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <ClockIcon className="w-5 h-5" />
                  Créditos - Next Up aparecerá aquí
                </h3>
                <div>
                  <label className="block text-sm font-medium mb-2">Inicio de créditos (mm:ss)</label>
                  <div className="flex gap-2">
                  <input
                    type="text"
                      placeholder="20:30"
                      value={creditsStartText}
                      onChange={(e) => setCreditsStartText(e.target.value)}
                      onBlur={(e) => {
                      const time = parseTime(e.target.value);
                      setCurrentTimings(prev => ({ ...prev, credits_start: time || undefined }));
                        setCreditsStartText(time ? formatTime(time) : '');
                    }}
                      className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                    <button
                      onClick={markCreditsStart}
                      disabled={!showPlayer}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Marcar inicio
                    </button>
                    <button
                      onClick={() => {
                        setCreditsStartText('');
                        setCreditsEndText('');
                        setCurrentTimings(prev => ({ ...prev, credits_start: undefined, credits_end: undefined }));
                      }}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Final de créditos (mm:ss)</label>
                  <div className="flex gap-2">
                  <input
                    type="text"
                      placeholder="22:00"
                      value={creditsEndText}
                      onChange={(e) => setCreditsEndText(e.target.value)}
                      onBlur={(e) => {
                      const time = parseTime(e.target.value);
                      setCurrentTimings(prev => ({ ...prev, credits_end: time || undefined }));
                        setCreditsEndText(time ? formatTime(time) : '');
                    }}
                      className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                    <button
                      onClick={markCreditsEnd}
                      disabled={!showPlayer}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Marcar fin
                    </button>
                  </div>
                  {currentTimings.credits_start && currentTimings.credits_end && (
                    <p className="mt-2 text-sm text-purple-400">
                      ✓ Next Up aparecerá en <span className="font-mono">{formatTime(currentTimings.credits_start)}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Botón guardar y mensaje */}
            <div className="flex items-center justify-between">
              <button
                onClick={saveTimings}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg transition-colors"
              >
                <DocumentCheckIcon className="w-5 h-5" />
                {isSaving ? 'Guardando...' : 'Guardar Tiempos'}
              </button>
              
              {message && (
                <div className={`px-4 py-2 rounded-lg ${message.includes('Error') ? 'bg-red-600' : 'bg-green-600'}`}>
                  {message}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}