import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const TMDB_BEARER = process.env.TMDB_BEARER;

// Provider IDs for each platform (region: US)
const PROVIDERS: Record<string, number> = {
  netflix: 8,
  prime: 9,
  max: 1899, // Max (formerly HBO Max)
  'disney-plus': 337,
  'apple-tv': 350,
  paramount: 531,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    const searchParams = request.nextUrl.searchParams;
    const mediaType = searchParams.get('media_type') || 'tv'; // 'movie' or 'tv'
    const page = searchParams.get('page') || '1';

    const providerId = PROVIDERS[provider];
    if (!providerId) {
      return NextResponse.json(
        { error: 'Invalid provider' },
        { status: 400 }
      );
    }

    logger.log(`🎬 [PLATFORM] Solicitando ${mediaType} para ${provider} (sinopsis: es-MX, posters: en-US)`);

    const baseParams = {
      include_adult: 'false',
      include_video: 'false',
      page: page,
      sort_by: 'popularity.desc',
      watch_region: 'US',
      with_watch_providers: providerId.toString(),
    };

    // Hacer dos peticiones en paralelo: una para sinopsis en español, otra para posters en inglés
    const [responseES, responseEN] = await Promise.all([
      fetch(
        `https://api.themoviedb.org/3/discover/${mediaType}?` +
        new URLSearchParams({ ...baseParams, language: 'es-MX' }),
        {
          headers: {
            Authorization: `Bearer ${TMDB_BEARER}`,
            'Content-Type': 'application/json',
          },
          next: { revalidate: 0 },
        }
      ),
      fetch(
        `https://api.themoviedb.org/3/discover/${mediaType}?` +
        new URLSearchParams({ ...baseParams, language: 'en-US' }),
        {
          headers: {
            Authorization: `Bearer ${TMDB_BEARER}`,
            'Content-Type': 'application/json',
          },
          next: { revalidate: 0 },
        }
      ),
    ]);

    if (!responseES.ok || !responseEN.ok) {
      throw new Error('TMDB API error');
    }

    const dataES = await responseES.json();
    const dataEN = await responseEN.json();

    // Mezclar resultados: títulos y sinopsis en español (MX), posters en inglés
    const mergedResults = dataES.results.map((itemES: any, index: number) => {
      const itemEN = dataEN.results[index];
      return {
        ...itemES,
        name: itemES.name, // Título en español latino
        title: itemES.title, // Título en español latino (por si acaso)
        overview: itemES.overview, // Sinopsis en español latino
        poster_path: itemEN?.poster_path || itemES.poster_path, // Poster en inglés
        backdrop_path: itemEN?.backdrop_path || itemES.backdrop_path, // Backdrop en inglés
      };
    });

    return NextResponse.json({
      ...dataES,
      results: mergedResults,
    });
  } catch (error) {
    logger.error('Error fetching platform content:', error);
    return NextResponse.json(
      { error: 'Failed to fetch content' },
      { status: 500 }
    );
  }
}

