import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${id}/images?api_key=${TMDB_API_KEY}&include_image_language=en`,
      { next: { revalidate: 86400 } } // Cache 24h
    );

    if (!response.ok) {
      throw new Error('Failed to fetch movie images');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching movie images:', error);
    return NextResponse.json(
      { error: 'Failed to fetch movie images' },
      { status: 500 }
    );
  }
}

