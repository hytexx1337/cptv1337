import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${id}/similar?language=en-US&page=1`,
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
    
    // Agregar media_type a cada película similar
    const moviesWithType = {
      ...data,
      results: data.results.map((movie: any) => ({
        ...movie,
        media_type: 'movie'
      }))
    };

    return NextResponse.json(moviesWithType);
  } catch (error) {
    logger.error('Error fetching similar movies:', error);
    return NextResponse.json(
      { error: 'Error al obtener películas similares' },
      { status: 500 }
    );
  }
}