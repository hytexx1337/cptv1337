import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getYTSMovies, searchYTSMovies, getPopularYTSMovies, getRecentYTSMovies } from '@/lib/yts';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract parameters
    const query = searchParams.get('query');
    const limit = parseInt(searchParams.get('limit') || '20');
    const page = parseInt(searchParams.get('page') || '1');
    const quality = searchParams.get('quality') as any;
    const genre = searchParams.get('genre');
    const minimumRating = parseFloat(searchParams.get('minimum_rating') || '0');
    const sortBy = searchParams.get('sort_by') as any;
    const orderBy = searchParams.get('order_by') as any;
    const type = searchParams.get('type'); // 'popular', 'recent', or default

    let movies = [];

    if (query) {
      // Search movies
      movies = await searchYTSMovies(query, limit);
    } else if (type === 'popular') {
      // Get popular movies
      movies = await getPopularYTSMovies(limit);
    } else if (type === 'recent') {
      // Get recent movies
      movies = await getRecentYTSMovies(limit);
    } else {
      // Get movies with filters
      movies = await getYTSMovies({
        limit,
        page,
        quality,
        genre: genre || undefined,
        minimum_rating: minimumRating,
        sort_by: sortBy,
        order_by: orderBy,
        query_term: query ?? undefined
      });
    }

    return NextResponse.json({
      movies,
      page,
      limit,
      source: 'yts'
    });
  } catch (error) {
    logger.error('Error fetching YTS movies:', error);
    return NextResponse.json(
      { 
        movies: [],
        page: 1,
        limit: 20,
        source: 'yts',
        error: 'Error al obtener películas de YTS'
      },
      { status: 200 } // Return 200 with empty results instead of error
    );
  }
}