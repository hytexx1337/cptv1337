'use client';

import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';

interface IntroTiming {
  start: number;
  end: number;
}

interface EpisodeTimings {
  intro?: IntroTiming;
  credits?: IntroTiming;
}

interface SeasonTimings {
  [episodeNumber: string]: EpisodeTimings;
}

interface SeriesTimings {
  tmdbId: number;
  title: string;
  seasons: {
    [seasonNumber: string]: {
      episodes: SeasonTimings;
    };
  };
}

interface IntroTimingsData {
  [seriesKey: string]: SeriesTimings;
}

interface UseIntroTimingsReturn {
  introTiming: IntroTiming | null;
  creditsTiming: IntroTiming | null;
  nextEpisodeInfo: {
    season: number;
    episode: number;
    title?: string;
  } | null;
  isLoading: boolean;
  error: string | null;
}

export function useIntroTimings(
  tmdbId: number | string | undefined,
  season: number | undefined,
  episode: number | undefined
): UseIntroTimingsReturn {
  const [timingsData, setTimingsData] = useState<IntroTimingsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar datos de intro-timings.json
  useEffect(() => {
    const loadTimings = async () => {
      if (!tmdbId) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/intro-timings.json');
        if (!response.ok) {
          throw new Error('No se pudo cargar intro-timings.json');
        }

        const data: IntroTimingsData = await response.json();
        setTimingsData(data);
      } catch (err) {
        logger.warn('⚠️ [INTRO-TIMINGS] Error cargando datos:', err);
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setIsLoading(false);
      }
    };

    loadTimings();
  }, [tmdbId]);

  // Obtener timings para el episodio actual
  const getTimingsForEpisode = (): UseIntroTimingsReturn => {
    if (!timingsData || !tmdbId || !season || !episode) {
      return {
        introTiming: null,
        creditsTiming: null,
        nextEpisodeInfo: null,
        isLoading,
        error,
      };
    }

    // Buscar la serie por tmdbId
    const series = Object.values(timingsData).find(
      (s) => s.tmdbId === Number(tmdbId)
    );

    if (!series) {
      return {
        introTiming: null,
        creditsTiming: null,
        nextEpisodeInfo: null,
        isLoading,
        error,
      };
    }

    // Obtener timings del episodio actual
    const seasonData = series.seasons[season.toString()];
    const episodeData = seasonData?.episodes[episode.toString()];

    // Calcular siguiente episodio
    let nextEpisodeInfo = null;
    const currentSeasonData = series.seasons[season.toString()];
    
    if (currentSeasonData) {
      // Intentar siguiente episodio en la misma temporada
      const nextEpisodeInSeason = currentSeasonData.episodes[(episode + 1).toString()];
      if (nextEpisodeInSeason) {
        nextEpisodeInfo = {
          season,
          episode: episode + 1,
          title: `S${season}E${episode + 1}`,
        };
      } else {
        // Intentar primer episodio de la siguiente temporada
        const nextSeasonData = series.seasons[(season + 1).toString()];
        if (nextSeasonData && nextSeasonData.episodes['1']) {
          nextEpisodeInfo = {
            season: season + 1,
            episode: 1,
            title: `S${season + 1}E1`,
          };
        }
      }
    }

    return {
      introTiming: episodeData?.intro || null,
      creditsTiming: episodeData?.credits || null,
      nextEpisodeInfo,
      isLoading,
      error,
    };
  };

  return getTimingsForEpisode();
}