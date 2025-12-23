import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getYTSMovieSuggestions, getYTSMovieByIMDB } from '@/lib/yts';
import { YTSMovie } from '@/types/yts';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const imdbCode = searchParams.get('imdb');

    let suggestions: YTSMovie[] = [];

    if (imdbCode) {
      // Si tenemos código IMDB, buscar la película en YTS primero
      const ytsMovie = await getYTSMovieByIMDB(imdbCode);
      if (ytsMovie) {
        // Obtener sugerencias basadas en la película de YTS
        suggestions = await getYTSMovieSuggestions({ movie_id: ytsMovie.id });
      }
    } else {
      // Intentar usar el ID directamente (si es un ID de YTS)
      try {
        const ytsId = parseInt(id);
        if (!isNaN(ytsId)) {
          suggestions = await getYTSMovieSuggestions({ movie_id: ytsId });
        }
      } catch (error) {
        logger.log('ID is not a valid YTS ID, skipping YTS suggestions');
      }
    }

    return NextResponse.json({
      id,
      suggestions,
      source: 'yts'
    });
  } catch (error) {
    logger.error('Error fetching YTS suggestions:', error);
    return NextResponse.json(
      { 
        id: await params.then(p => p.id),
        suggestions: [] as YTSMovie[],
        source: 'yts',
        error: 'Error al obtener sugerencias de YTS'
      },
      { status: 200 } // Return 200 with empty suggestions instead of error
    );
  }
}