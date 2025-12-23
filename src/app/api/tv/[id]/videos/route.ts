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
      `${TMDB_BASE_URL}/tv/${id}/videos?language=en-US`,
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
    
    // Filtrar solo trailers de YouTube
    const trailers = data.results.filter((video: any) => 
      video.type === 'Trailer' && 
      video.site === 'YouTube' && 
      video.official === true
    );

    return NextResponse.json({
      id: data.id,
      results: trailers
    });
  } catch (error) {
    logger.error('Error fetching TV show videos:', error);
    return NextResponse.json(
      { error: 'Error al obtener videos de la serie' },
      { status: 500 }
    );
  }
}