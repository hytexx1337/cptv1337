import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const TMDB_BEARER = process.env.TMDB_BEARER;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const response = await fetch(
      `https://api.themoviedb.org/3/movie/${id}/recommendations?language=es-MX`,
      {
        headers: {
          Authorization: `Bearer ${TMDB_BEARER}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 3600 }, // Cache por 1 hora
      }
    );

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Agregar media_type a cada item
    const results = {
      ...data,
      results: data.results?.map((item: any) => ({ ...item, media_type: 'movie' })) || []
    };
    
    return NextResponse.json(results);
  } catch (error) {
    logger.error('Error fetching movie recommendations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recommendations' },
      { status: 500 }
    );
  }
}

