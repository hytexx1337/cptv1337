import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * API endpoint para obtener anime desde Jikan (MyAnimeList)
 * Devuelve anime real con géneros correctos
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const genreId = searchParams.get('genre'); // MAL genre ID
    const page = searchParams.get('page') || '1';
    const type = searchParams.get('type') || 'tv'; // tv, movie, etc.
    const orderBy = searchParams.get('order_by') || 'popularity';
    const limit = searchParams.get('limit') || '25';

    // Construir URL de Jikan
    let jikanUrl = `https://api.jikan.moe/v4/anime?`;
    jikanUrl += `type=${type}&`;
    jikanUrl += `page=${page}&`;
    jikanUrl += `limit=${limit}&`;
    jikanUrl += `order_by=${orderBy}&`;
    jikanUrl += `sort=desc&`;
    jikanUrl += `sfw=true`; // Safe for work (sin contenido adulto)
    
    if (genreId) {
      jikanUrl += `&genres=${genreId}`;
    }

    console.log(`[ANIME-MAL] Consultando Jikan: ${jikanUrl}`);

    const response = await fetch(jikanUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Jikan API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Para cada anime de MAL, buscar su equivalente en TMDB
    const searchPromises = data.data?.slice(0, 20).map(async (anime: any) => {
      try {
        // Buscar en TMDB usando el título y año
        const searchQuery = encodeURIComponent(anime.title);
        const tmdbResponse = await fetch(
          `https://api.themoviedb.org/3/search/tv?query=${searchQuery}&language=es-MX&include_adult=false`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (tmdbResponse.ok) {
          const tmdbData = await tmdbResponse.json();
          const tmdbResult = tmdbData.results?.[0];

          if (tmdbResult) {
            // Combinar datos de MAL con ID de TMDB
            return {
              id: tmdbResult.id, // ID de TMDB para los links
              name: tmdbResult.name || anime.title,
              original_name: anime.title_japanese || anime.title,
              overview: tmdbResult.overview || anime.synopsis || '',
              poster_path: tmdbResult.poster_path,
              backdrop_path: tmdbResult.backdrop_path,
              vote_average: anime.score || tmdbResult.vote_average || 0,
              vote_count: anime.scored_by || tmdbResult.vote_count || 0,
              first_air_date: tmdbResult.first_air_date || anime.aired?.from || '',
              media_type: 'tv',
              // Datos adicionales de MAL
              mal_id: anime.mal_id,
              mal_url: anime.url,
              mal_score: anime.score,
              genres: anime.genres?.map((g: any) => g.name) || [],
              episodes: anime.episodes,
              status: anime.status,
              year: anime.year,
            };
          }
        }
      } catch (error) {
        console.error(`[ANIME-MAL] Error buscando ${anime.title} en TMDB:`, error);
      }

      // Si no se encuentra en TMDB, devolver null
      return null;
    }) || [];

    const allResults = await Promise.all(searchPromises);
    const transformedResults = allResults.filter(r => r !== null);

    return NextResponse.json({
      page: data.pagination?.current_page || 1,
      total_pages: data.pagination?.last_visible_page || 1,
      total_results: transformedResults.length,
      results: transformedResults,
    });
  } catch (error: any) {
    console.error('[ANIME-MAL] Error:', error);
    return NextResponse.json(
      { error: 'Error fetching anime from MAL', message: error.message },
      { status: 500 }
    );
  }
}

