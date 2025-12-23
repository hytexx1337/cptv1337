import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Cache de 1 semana
const CACHE_TIME = 60 * 60 * 24 * 7;

interface TrailerVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const mediaType = searchParams.get('type') || 'movie';

    if (!process.env.NEXT_PUBLIC_TMDB_API_KEY) {
      return NextResponse.json(
        { error: 'TMDB API key no configurada' },
        { status: 500 }
      );
    }

    // Fetch trailers desde TMDB
    const response = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${id}/videos?language=en-US`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: CACHE_TIME }
      }
    );

    if (!response.ok) {
      console.error(`[TRAILERS] Error fetching from TMDB: ${response.status}`);
      return NextResponse.json(
        { error: 'Error obteniendo trailers' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const allVideos = (data.results || []) as TrailerVideo[];

    // Filtrar solo trailers de YouTube
    const youtubeTrailers = allVideos.filter(
      (video) => video.site === 'YouTube' && video.type === 'Trailer'
    );

    // Priorizar trailers oficiales
    const officialTrailers = youtubeTrailers.filter(v => v.official);
    const trailers = officialTrailers.length > 0 ? officialTrailers : youtubeTrailers;

    console.log(`✅ [TRAILERS] ${mediaType}/${id}: ${trailers.length} trailers encontrados`);

    // Cache en el edge por 1 semana
    return NextResponse.json(
      { 
        trailers,
        cached: true,
        mediaType,
        id 
      },
      {
        headers: {
          'Cache-Control': `public, s-maxage=${CACHE_TIME}, stale-while-revalidate=${CACHE_TIME * 2}`,
        },
      }
    );
  } catch (error: any) {
    console.error('[TRAILERS] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', message: error.message },
      { status: 500 }
    );
  }
}

