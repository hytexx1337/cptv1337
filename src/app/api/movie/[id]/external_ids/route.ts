import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const res = await fetch(
      `${TMDB_BASE_URL}/movie/${id}/external_ids`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'No se pudieron obtener external IDs' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching movie external_ids:', error);
    return NextResponse.json(
      { error: 'Error al obtener external IDs de la película' },
      { status: 500 }
    );
  }
}