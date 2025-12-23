import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// IDs bloqueados (contenido inapropiado)
const BLOCKED_IDS = [288577, 95897, 241002];

/**
 * API endpoint para obtener anime japonés
 * Filtra por:
 * - Género: Animación (16)
 * - País de origen: Japón (JP)
 * - Solo series de TV
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const genre = searchParams.get('genre');
    const page = searchParams.get('page') || '1';
    const sortBy = searchParams.get('sort_by') || 'popularity.desc';
    const provider = searchParams.get('provider'); // Para Crunchyroll

    // Siempre incluir género 16 (Animación) + género específico si se proporciona
    const genres = genre ? `16,${genre}` : '16';

    // Fecha máxima = hoy (para evitar contenido futuro)
    const today = new Date().toISOString().split('T')[0];

    // Parámetros base comunes
    const baseParams = 
      `include_adult=false&` +
      `page=${page}&` +
      `sort_by=${sortBy}&` +
      `with_genres=${genres}&` +
      `with_origin_country=JP&` +
      `with_original_language=ja&` +
      `first_air_date.lte=${today}`;

    // Agregar Crunchyroll si se solicita
    const providerParams = provider === 'crunchyroll' 
      ? `&with_watch_providers=283&watch_region=US` 
      : '';

    // Hacer dos peticiones en paralelo: sinopsis en español (MX) y posters en inglés
    const [responseES, responseEN] = await Promise.all([
      fetch(
        `https://api.themoviedb.org/3/discover/tv?${baseParams}&language=es-MX${providerParams}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
            'Content-Type': 'application/json',
          },
          next: { revalidate: 3600 }
        }
      ),
      fetch(
        `https://api.themoviedb.org/3/discover/tv?${baseParams}&language=en-US${providerParams}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
            'Content-Type': 'application/json',
          },
          next: { revalidate: 3600 }
        }
      ),
    ]);

    if (!responseES.ok || !responseEN.ok) {
      throw new Error(`TMDB API error: ${responseES.status} / ${responseEN.status}`);
    }

    const dataES = await responseES.json();
    const dataEN = await responseEN.json();
    
    // Filtrar IDs bloqueados
    const filteredResultsES = dataES.results?.filter((item: any) => 
      !BLOCKED_IDS.includes(item.id)
    ) || [];
    
    const filteredResultsEN = dataEN.results?.filter((item: any) => 
      !BLOCKED_IDS.includes(item.id)
    ) || [];
    
    // Mezclar resultados: títulos y sinopsis en español (MX), posters en inglés
    const mergedResults = filteredResultsES.map((itemES: any, index: number) => {
      const itemEN = filteredResultsEN[index];
      return {
        ...itemES,
        name: itemES.name, // Título en español latino
        title: itemES.title, // Título en español latino (por si acaso)
        overview: itemES.overview, // Sinopsis en español latino
        poster_path: itemEN?.poster_path || itemES.poster_path, // Poster en inglés
        backdrop_path: itemEN?.backdrop_path || itemES.backdrop_path, // Backdrop en inglés
        media_type: 'tv'
      };
    });

    return NextResponse.json({
      ...dataES,
      results: mergedResults,
      total_results: mergedResults.length
    });
  } catch (error: any) {
    console.error('Error fetching anime:', error);
    return NextResponse.json(
      { error: 'Error fetching anime', message: error.message },
      { status: 500 }
    );
  }
}

