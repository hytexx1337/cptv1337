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

// Obtener temporadas desde IMDB para animes
async function getIMDBSeasons(imdbId: string) {
  try {
    const response = await fetch(`${IMDB_API_URL}/titles/${imdbId}/seasons`, {
      headers: { 'accept': 'application/json' }
    });
    
    if (!response.ok) {
      logger.warn(`IMDB API error for ${imdbId}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    // Filtrar temporadas "unknown" y convertir a formato TMDB
    return data.seasons
      ?.filter((s: any) => s.season !== 'unknown' && s.season !== '0')
      .map((s: any) => ({
        season_number: parseInt(s.season),
        episode_count: s.episodeCount,
        name: `Season ${s.season}`,
        overview: '',
        poster_path: null,
        air_date: null,
      })) || null;
  } catch (error) {
    logger.error('Error fetching IMDB seasons:', error);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Obtener datos en inglés (títulos, posters, etc.) incluyendo temporadas y episodios
    const [responseEN, responseES, externalIdsResponse] = await Promise.all([
      fetch(
        `${TMDB_BASE_URL}/tv/${id}?language=en-US&append_to_response=seasons`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
            'Content-Type': 'application/json',
          },
        }
      ),
      // Obtener solo la descripción en español
      fetch(
        `${TMDB_BASE_URL}/tv/${id}?language=es-MX`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
            'Content-Type': 'application/json',
          },
        }
      ),
      // Obtener external IDs (incluye IMDB ID)
      fetch(
        `${TMDB_BASE_URL}/tv/${id}/external_ids`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
            'Content-Type': 'application/json',
          },
        }
      )
    ]);

    if (!responseEN.ok) {
      throw new Error(`TMDb API error: ${responseEN.status}`);
    }

    const dataEN = await responseEN.json();
    const dataES = responseES.ok ? await responseES.json() : null;
    const externalIds = externalIdsResponse.ok ? await externalIdsResponse.json() : null;

    // Detectar si es anime y obtener temporadas de IMDB
    let seasonsData = dataEN.seasons;
    let useIMDBData = false;
    
    // Verificar si NO está en la lista de excepciones
    const shouldUseIMDB = isAnime(dataEN) && externalIds?.imdb_id && !ANIME_TMDB_EXCEPTIONS.includes(parseInt(id));
    
    if (shouldUseIMDB) {
      logger.info(`Anime detected: ${dataEN.name} (${externalIds.imdb_id})`);
      const imdbSeasons = await getIMDBSeasons(externalIds.imdb_id);
      
      if (imdbSeasons && imdbSeasons.length > 0) {
        logger.info(`Using IMDB seasons for ${dataEN.name}: ${imdbSeasons.length} seasons`);
        useIMDBData = true;
        // Mezclar datos de IMDB con datos de TMDB (mantener posters, etc)
        seasonsData = imdbSeasons.map((imdbSeason: any) => {
          const tmdbSeason = dataEN.seasons?.find((s: any) => s.season_number === imdbSeason.season_number);
          return {
            // Si TMDB tiene datos para esta temporada, usarlos como base (posters, etc)
            ...(tmdbSeason || {}),
            // Sobrescribir con datos de IMDB
            ...imdbSeason,
            // Asegurar que episode_count sea de IMDB
            episode_count: imdbSeason.episode_count
          };
        });
        logger.info(`Seasons after IMDB merge: ${seasonsData.length} seasons - Numbers: ${seasonsData.map((s: any) => s.season_number).join(', ')}`);
      } else {
        logger.warn(`Could not fetch IMDB seasons for ${externalIds.imdb_id}, using TMDB data`);
      }
    }

    // Obtener detalles de episodios para cada temporada
    const filteredSeasons = seasonsData?.filter((season: any) => season.season_number !== 0) || [];
    logger.info(`Seasons after filtering specials: ${filteredSeasons.length} seasons`);
    
    const seasonsWithEpisodes = await Promise.all(
      filteredSeasons.map(async (season: any) => {
        
        // Si es anime con datos de IMDB, obtener episodios desde IMDB
        if (useIMDBData && externalIds?.imdb_id) {
          logger.info(`Fetching IMDB episodes for season ${season.season_number}...`);
          try {
            const episodesResponse = await fetch(
              `${IMDB_API_URL}/titles/${externalIds.imdb_id}/episodes?season=${season.season_number}`,
              {
                headers: { 'accept': 'application/json' }
              }
            );
            
            if (episodesResponse.ok) {
              const episodesData = await episodesResponse.json();
              
              if (episodesData.episodes && episodesData.episodes.length > 0) {
                logger.info(`✅ Got ${episodesData.episodes.length} episodes from IMDB for season ${season.season_number}`);
                
                // Mapear episodios de IMDB a formato TMDB
                const imdbEpisodes = episodesData.episodes.map((ep: any) => ({
                  episode_number: ep.episodeNumber,
                  name: ep.title || `Episode ${ep.episodeNumber}`,
                  overview: ep.plot || '',
                  // Usar URL completa de IMDB para la imagen
                  still_path: ep.primaryImage?.url || null,
                  // Agregar flag para indicar que es URL de IMDB
                  _isImdbImage: !!ep.primaryImage?.url,
                  air_date: ep.releaseDate 
                    ? `${ep.releaseDate.year}-${String(ep.releaseDate.month).padStart(2, '0')}-${String(ep.releaseDate.day).padStart(2, '0')}` 
                    : null,
                  vote_average: ep.rating?.aggregateRating || null,
                  vote_count: ep.rating?.voteCount || null
                }));
                
                return {
                  ...season,
                  episodes: imdbEpisodes
                };
              }
            } else {
              logger.warn(`Failed to fetch IMDB episodes for season ${season.season_number}: ${episodesResponse.status}`);
            }
          } catch (error) {
            logger.error(`Error fetching IMDB episodes for season ${season.season_number}:`, error);
          }
          
          // Fallback a episodios dummy si falla IMDB
          logger.info(`Using dummy episodes for season ${season.season_number}: ${season.episode_count} episodes`);
          const dummyEpisodes = Array.from({ length: season.episode_count || 0 }, (_, i) => ({
            episode_number: i + 1,
            name: `Episode ${i + 1}`,
            overview: '',
            still_path: null,
            air_date: null
          }));
          return {
            ...season,
            episodes: dummyEpisodes
          };
        }
        
        // Para no-animes, obtener episodios de TMDB
        try {
          const seasonResponse = await fetch(
            `${TMDB_BASE_URL}/tv/${id}/season/${season.season_number}?language=en-US`,
            {
              headers: {
                'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          if (seasonResponse.ok) {
            const seasonData = await seasonResponse.json();
            return {
              ...season,
              episodes: seasonData.episodes
            };
          }
        } catch (error) {
          logger.error(`Error fetching season ${season.season_number}:`, error);
        }
        
        return season;
      })
    );

    // Combinar: usar datos en inglés pero overview en español si está disponible
    const data = {
      ...dataEN,
      overview: dataES?.overview || dataEN.overview, // Priorizar descripción en español
      seasons: seasonsWithEpisodes
    };

    logger.info(`Final response for ${dataEN.name}: ${data.seasons.length} seasons`);
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching TV show details:', error);
    return NextResponse.json(
      { error: 'Error al obtener detalles de la serie' },
      { status: 500 }
    );
  }
}