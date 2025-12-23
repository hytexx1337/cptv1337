import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ genreId: string }> }
) {
  const { genreId } = await params;
  const { searchParams } = new URL(request.url);
  const mediaType = searchParams.get('media_type') || 'movie';
  const page = searchParams.get('page') || '1';

  try {
    const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
    const url = `https://api.themoviedb.org/3/discover/${endpoint}?with_genres=${genreId}&page=${page}&language=es-MX&sort_by=popularity.desc&include_adult=false`;

    console.log('[GENRE API DEBUG] Genre:', genreId, 'Type:', mediaType, 'Page:', page);
    console.log('[GENRE API DEBUG] Has TMDB_BEARER:', !!process.env.TMDB_BEARER);
    console.log('[GENRE API DEBUG] URL:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 3600 }
    });

    console.log('[GENRE API DEBUG] TMDB Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GENRE API DEBUG] TMDB Error:', errorText);
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('[GENRE API DEBUG] Results count:', data.results?.length || 0);
    console.log('[GENRE API DEBUG] Total results:', data.total_results || 0);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching genre content:', error);
    return NextResponse.json(
      { error: 'Error al obtener contenido' },
      { status: 500 }
    );
  }
}

