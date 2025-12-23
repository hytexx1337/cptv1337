import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMDB_API_URL = 'https://api.imdbapi.dev';

// IDs de animes que NO deben usar IMDb (tienen mejor estructura en TMDB)
const ANIME_TMDB_EXCEPTIONS = [
  12971, // Dragon Ball Z - IMDb tiene todo en 1 temporada, TMDB tiene 9 temporadas correctas
];

// Detectar si es anime basado en géneros y país de origen
function isAnime(data: any): boolean {
  const hasAnimationGenre = data.genres?.some((g: any) => 
    g.name === 'Animation' || g.id === 16
  );
  const isFromJapanOrKorea = data.origin_country?.some((country: string) => 
    ['JP', 'KR'].includes(country)
  );
  
  return hasAnimationGenre && isFromJapanOrKorea;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; season_number: string }> }
) {
  try {
    const { id, season_number } = await params;

    // Primero, obtener info básica de la serie para detectar si es anime
    const tvInfoResponse = await fetch(
      `${TMDB_BASE_URL}/tv/${id}?language=en-US`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!tvInfoResponse.ok) {
      throw new Error(`TMDb API error: ${tvInfoResponse.status}`);
    }

    const tvInfo = await tvInfoResponse.json();
    const isAnimeSeries = isAnime(tvInfo);
    
    // Verificar si NO está en la lista de excepciones
    const shouldUseIMDB = isAnimeSeries && !ANIME_TMDB_EXCEPTIONS.includes(parseInt(id));

    // Si es anime (y no está en excepciones), intentar obtener desde IMDB
    if (shouldUseIMDB) {
      try {
        const externalIdsResponse = await fetch(
          `${TMDB_BASE_URL}/tv/${id}/external_ids`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (externalIdsResponse.ok) {
          const externalIds = await externalIdsResponse.json();
          
          if (externalIds.imdb_id) {
            logger.info(`Fetching season ${season_number} episodes from IMDB for anime ${tvInfo.name}`);
            
            const episodesResponse = await fetch(
              `${IMDB_API_URL}/titles/${externalIds.imdb_id}/episodes?season=${season_number}`,
              {
                headers: { 'accept': 'application/json' }
              }
            );
            
            if (episodesResponse.ok) {
              const episodesData = await episodesResponse.json();
              
              if (episodesData.episodes && episodesData.episodes.length > 0) {
                logger.info(`✅ Got ${episodesData.episodes.length} episodes from IMDB for season ${season_number}`);
                
                // Mapear episodios de IMDB a formato TMDB
                const imdbEpisodes = episodesData.episodes.map((ep: any) => ({
                  episode_number: ep.episodeNumber,
                  name: ep.title || `Episode ${ep.episodeNumber}`,
                  overview: ep.plot || '',
                  still_path: ep.primaryImage?.url || null,
                  air_date: ep.releaseDate 
                    ? `${ep.releaseDate.year}-${String(ep.releaseDate.month).padStart(2, '0')}-${String(ep.releaseDate.day).padStart(2, '0')}` 
                    : null,
                  vote_average: ep.rating?.aggregateRating || null,
                  vote_count: ep.rating?.voteCount || null
                }));
                
                // Obtener info básica de la temporada desde TMDB
                const tmdbSeasonResponse = await fetch(
                  `${TMDB_BASE_URL}/tv/${id}/season/${season_number}?language=es-MX`,
                  {
                    headers: {
                      'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
                      'Content-Type': 'application/json',
                    },
                  }
                );
                
                let seasonInfo: any = {
                  season_number: parseInt(season_number),
                  episodes: imdbEpisodes
                };
                
                if (tmdbSeasonResponse.ok) {
                  const tmdbSeasonData = await tmdbSeasonResponse.json();
                  seasonInfo = {
                    ...tmdbSeasonData,
                    episodes: imdbEpisodes
                  };
                }
                
                return NextResponse.json(seasonInfo);
              }
            }
          }
        }
      } catch (imdbError) {
        logger.warn(`Failed to fetch from IMDB, falling back to TMDB:`, imdbError);
      }
    }

    // Para no-animes o si falla IMDB, usar TMDB
    const response = await fetch(
      `${TMDB_BASE_URL}/tv/${id}/season/${season_number}?language=es-MX`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`TMDb API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching TV season details:', error);
    return NextResponse.json(
      { error: 'Error al obtener detalles de la temporada' },
      { status: 500 }
    );
  }
}