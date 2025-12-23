import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getYTSMovieDetails } from '@/lib/yts';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    
    const withImages = searchParams.get('with_images') === 'true';
    const withCast = searchParams.get('with_cast') === 'true';

    const movieId = parseInt(id);
    if (isNaN(movieId)) {
      return NextResponse.json(
        { error: 'ID de película inválido' },
        { status: 400 }
      );
    }

    const movie = await getYTSMovieDetails({
      movie_id: movieId,
      with_images: withImages,
      with_cast: withCast
    });

    if (!movie) {
      return NextResponse.json(
        { error: 'Película no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      movie,
      source: 'yts'
    });
  } catch (error) {
    logger.error('Error fetching YTS movie details:', error);
    return NextResponse.json(
      { error: 'Error al obtener detalles de la película de YTS' },
      { status: 500 }
    );
  }
}