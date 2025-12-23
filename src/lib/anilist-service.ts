import { logger } from '@/lib/logger';
/**
 * AniList API Service
 * Documentación: https://anilist.gitbook.io/anilist-apiv2-docs
 */

export interface AniListAnime {
  id: number;
  idMal: number | null;
  title: {
    romaji: string;
    english: string | null;
    native: string;
  };
  description: string | null;
  episodes: number | null;
  duration: number | null;
  season: string | null;
  seasonYear: number | null;
  coverImage: {
    large: string;
    extraLarge: string;
  };
  bannerImage: string | null;
  genres: string[];
  averageScore: number | null;
  popularity: number;
  studios: {
    nodes: Array<{
      name: string;
      isAnimationStudio: boolean;
    }>;
  };
  streamingEpisodes: Array<{
    title: string | null;
    thumbnail: string | null;
    url: string | null;
  }>;
  nextAiringEpisode: {
    airingAt: number;
    episode: number;
  } | null;
  relations?: {
    edges: Array<{
      relationType: string;
      node: {
        id: number;
        type: string;
        season: string | null;
        seasonYear: number | null;
        episodes: number | null;
      };
    }>;
  };
  startDate?: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
}

const ANILIST_API = 'https://graphql.anilist.co';

/**
 * Buscar anime en AniList por título y temporada específica
 * Busca todas las temporadas relacionadas y devuelve la correcta
 */
export async function searchAniListByTitleAndSeason(
  title: string, 
  seasonNumber: number
): Promise<AniListAnime | null> {
  try {
    // Primero buscar la entrada principal
    const mainAnime = await searchAniListByTitle(title);
    if (!mainAnime) return null;

    logger.log(`🔎 Búsqueda inicial para "${title}": encontrado "${mainAnime.title.romaji}" (ID: ${mainAnime.id}, Episodes: ${mainAnime.episodes})`);

    // Si solo hay una temporada o es la primera, devolver directamente
    if (seasonNumber === 1) {
      // Verificar si es realmente la primera temporada buscando precuelas
      const hasPrecuelas = mainAnime.relations?.edges.some(
        edge => edge.relationType === 'PREQUEL' && edge.node.type === 'ANIME'
      );
      
      if (hasPrecuelas) {
        // Buscar la precuela (temporada 1)
        const precuela = mainAnime.relations?.edges.find(
          edge => edge.relationType === 'PREQUEL' && edge.node.type === 'ANIME'
        );
        if (precuela) {
          const precuelaData = await getAniListAnimeById(precuela.node.id);
          if (precuelaData) {
            logger.log(`⬅️ Encontrada precuela para temporada 1: "${precuelaData.title.romaji}" (ID: ${precuelaData.id}, Episodes: ${precuelaData.episodes})`);
            return precuelaData;
          }
        }
      }
      
      logger.log(`✅ Usando anime principal como temporada 1: "${mainAnime.title.romaji}"`);
      return mainAnime;
    }

    // Para temporadas > 1, buscar secuelas
    let currentAnime = mainAnime;
    let currentSeason = 1;

    // Si el anime principal tiene precuelas, empezar desde la primera
    const hasPrecuelas = currentAnime.relations?.edges.some(
      edge => edge.relationType === 'PREQUEL' && edge.node.type === 'ANIME'
    );

    if (hasPrecuelas) {
      // Ir a la precuela para empezar desde temporada 1
      const precuela = currentAnime.relations?.edges.find(
        edge => edge.relationType === 'PREQUEL' && edge.node.type === 'ANIME'
      );
      if (precuela) {
        const precuelaData = await getAniListAnimeById(precuela.node.id);
        if (precuelaData) {
          currentAnime = precuelaData;
        }
      }
    }

    // Recorrer secuelas hasta llegar a la temporada deseada
    while (currentSeason < seasonNumber) {
      const sequel = currentAnime.relations?.edges.find(
        edge => edge.relationType === 'SEQUEL' && edge.node.type === 'ANIME'
      );

      if (!sequel) {
        logger.warn(`No se encontró temporada ${seasonNumber} para ${title}`);
        return currentAnime; // Devolver la última encontrada
      }

      const sequelData = await getAniListAnimeById(sequel.node.id);
      if (!sequelData) break;

      currentAnime = sequelData;
      currentSeason++;
    }

    return currentAnime;
  } catch (error) {
    logger.error('Error searching AniList by title and season:', error);
    return null;
  }
}

/**
 * Buscar anime en AniList por título
 */
export async function searchAniListByTitle(title: string): Promise<AniListAnime | null> {
  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        description
        episodes
        duration
        season
        seasonYear
        startDate {
          year
          month
          day
        }
        coverImage {
          large
          extraLarge
        }
        bannerImage
        genres
        averageScore
        popularity
        studios {
          nodes {
            name
            isAnimationStudio
          }
        }
        streamingEpisodes {
          title
          thumbnail
          url
        }
        nextAiringEpisode {
          airingAt
          episode
        }
        relations {
          edges {
            relationType
            node {
              id
              type
              season
              seasonYear
              episodes
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { search: title },
      }),
    });

    if (!response.ok) {
      throw new Error('AniList API error');
    }

    const data = await response.json();
    return data.data.Media;
  } catch (error) {
    logger.error('Error fetching from AniList:', error);
    return null;
  }
}

/**
 * Obtener detalles completos de un anime por su ID de AniList
 */
export async function getAniListAnimeById(anilistId: number): Promise<AniListAnime | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        description
        episodes
        duration
        season
        seasonYear
        startDate {
          year
          month
          day
        }
        coverImage {
          large
          extraLarge
        }
        bannerImage
        genres
        averageScore
        popularity
        studios {
          nodes {
            name
            isAnimationStudio
          }
        }
        streamingEpisodes {
          title
          thumbnail
          url
        }
        nextAiringEpisode {
          airingAt
          episode
        }
        relations {
          edges {
            relationType
            node {
              id
              type
              season
              seasonYear
              episodes
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { id: anilistId },
      }),
    });

    if (!response.ok) {
      throw new Error('AniList API error');
    }

    const data = await response.json();
    return data.data.Media;
  } catch (error) {
    logger.error('Error fetching from AniList:', error);
    return null;
  }
}

/**
 * Buscar anime por MAL ID (MyAnimeList)
 */
export async function getAniListAnimeByMALId(malId: number): Promise<AniListAnime | null> {
  const query = `
    query ($malId: Int) {
      Media(idMal: $malId, type: ANIME) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        description
        episodes
        duration
        season
        seasonYear
        coverImage {
          large
          extraLarge
        }
        bannerImage
        genres
        averageScore
        popularity
        studios {
          nodes {
            name
            isAnimationStudio
          }
        }
        streamingEpisodes {
          title
          thumbnail
          url
        }
        nextAiringEpisode {
          airingAt
          episode
        }
      }
    }
  `;

  try {
    const response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { malId },
      }),
    });

    if (!response.ok) {
      throw new Error('AniList API error');
    }

    const data = await response.json();
    return data.data.Media;
  } catch (error) {
    logger.error('Error fetching from AniList:', error);
    return null;
  }
}

/**
 * Convertir HTML de AniList a texto plano
 */
export function cleanAniListDescription(html: string | null): string {
  if (!html) return '';
  
  // Remover tags HTML
  let text = html.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  
  // Decodificar entidades HTML
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  return text.trim();
}

/**
 * Generar episodios desde AniList
 * AniList no proporciona episodios individuales, solo el total
 * Para anime con múltiples temporadas, usamos episodios genéricos para evitar mezclas
 */
export function generateEpisodesFromAniList(anime: AniListAnime) {
  const totalEpisodes = anime.episodes || 0;
  
  logger.log(`📊 AniList "${anime.title.romaji}": total=${totalEpisodes} episodios`);
  
  // Detectar si tiene PREQUEL o SEQUEL (múltiples temporadas)
  const hasPrequel = anime.relations?.edges.some(
    edge => edge.relationType === 'PREQUEL' && edge.node.type === 'ANIME'
  );
  const hasSequel = anime.relations?.edges.some(
    edge => edge.relationType === 'SEQUEL' && edge.node.type === 'ANIME'
  );
  const hasMultipleSeasons = hasPrequel || hasSequel;
  
  if (hasMultipleSeasons) {
    logger.log(`🔗 Anime con múltiples temporadas detectado, generando ${totalEpisodes} episodios genéricos`);
    logger.log(`   ${hasPrequel ? '⬅️ Tiene precuela' : ''} ${hasSequel ? '➡️ Tiene secuela' : ''}`);
    
    // Para anime con múltiples temporadas, SIEMPRE usar episodios genéricos
    // Esto evita que streamingEpisodes mezcle episodios de diferentes temporadas
    return Array.from({ length: totalEpisodes }, (_, i) => ({
      id: anime.id * 1000 + i + 1,
      episode_number: i + 1,
      season_number: 1,
      name: `Episode ${i + 1}`,
      overview: '',
      still_path: null,
      air_date: '',
      vote_average: 0,
      vote_count: 0,
      runtime: anime.duration || 24,
    }));
  }
  
  // Solo para anime de una sola temporada, intentar usar streamingEpisodes
  if (anime.streamingEpisodes && anime.streamingEpisodes.length > 0) {
    logger.log(`📺 Anime de temporada única, usando ${anime.streamingEpisodes.length} streamingEpisodes`);
    
    // Limitar a la cantidad real de episodios del anime
    const episodesToUse = anime.streamingEpisodes.slice(0, totalEpisodes);
    
    // Invertir si están al revés (detectar si el primer episodio tiene número mayor que el último)
    const firstEpisodeNum = extractEpisodeNumber(episodesToUse[0].title);
    const lastEpisodeNum = extractEpisodeNumber(episodesToUse[episodesToUse.length - 1].title);
    
    if (firstEpisodeNum > lastEpisodeNum) {
      logger.log('🔄 Episodios están al revés, invirtiendo orden...');
      episodesToUse.reverse();
    }
    
    return episodesToUse.map((ep, index) => ({
      id: anime.id * 1000 + index + 1,
      episode_number: index + 1,
      season_number: 1,
      name: ep.title || `Episode ${index + 1}`,
      overview: '',
      still_path: ep.thumbnail || null,
      air_date: '',
      vote_average: 0,
      vote_count: 0,
      runtime: anime.duration || 24,
    }));
  }
  
  // Si no hay streamingEpisodes, generar episodios genéricos
  logger.log(`⚠️ No hay streamingEpisodes, generando ${totalEpisodes} episodios genéricos`);
  return Array.from({ length: totalEpisodes }, (_, i) => ({
    id: anime.id * 1000 + i + 1,
    episode_number: i + 1,
    season_number: 1,
    name: `Episode ${i + 1}`,
    overview: '',
    still_path: null,
    air_date: '',
    vote_average: 0,
    vote_count: 0,
    runtime: anime.duration || 24,
  }));
}

/**
 * Extraer número de episodio de un título
 * Ejemplos: "Episode 1", "Ep 12", "1 - Title"
 */
function extractEpisodeNumber(title: string | null): number {
  if (!title) return 0;
  
  // Buscar patrones comunes: "Episode 1", "Ep 12", "E01", "1 -"
  const patterns = [
    /Episode\s*(\d+)/i,
    /Ep\.?\s*(\d+)/i,
    /E(\d+)/i,
    /^(\d+)\s*[-–—]/,
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  
  return 0;
}

/**
 * Contar cuántas temporadas tiene un anime en AniList
 * Navega todas las precuelas y secuelas para contar el total
 */
export async function countAnimeSeasons(title: string): Promise<number> {
  try {
    const mainAnime = await searchAniListByTitle(title);
    if (!mainAnime) return 1;

    // Primero, ir a la primera temporada (seguir precuelas hasta el final)
    let firstSeason = mainAnime;
    let precuelasCount = 0;
    
    while (true) {
      const precuela = firstSeason.relations?.edges.find(
        edge => edge.relationType === 'PREQUEL' && edge.node.type === 'ANIME'
      );
      
      if (!precuela) break;
      
      const precuelaData = await getAniListAnimeById(precuela.node.id);
      if (!precuelaData) break;
      
      firstSeason = precuelaData;
      precuelasCount++;
    }
    
    // Ahora contar hacia adelante (secuelas)
    let currentSeason = firstSeason;
    let sequelasCount = 0;
    
    while (true) {
      const sequel = currentSeason.relations?.edges.find(
        edge => edge.relationType === 'SEQUEL' && edge.node.type === 'ANIME'
      );
      
      if (!sequel) break;
      
      const sequelData = await getAniListAnimeById(sequel.node.id);
      if (!sequelData) break;
      
      currentSeason = sequelData;
      sequelasCount++;
    }
    
    const totalSeasons = 1 + precuelasCount + sequelasCount;
    logger.log(`📺 AniList temporadas: ${totalSeasons} (${precuelasCount} precuelas + 1 principal + ${sequelasCount} secuelas)`);
    
    return totalSeasons;
  } catch (error) {
    logger.error('Error counting anime seasons:', error);
    return 1;
  }
}

