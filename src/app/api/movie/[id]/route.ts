import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Obtener datos en inglés (títulos, posters, etc.)
    const [responseEN, responseES] = await Promise.all([
      fetch(
        `${TMDB_BASE_URL}/movie/${id}?language=en-US`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
            'Content-Type': 'application/json',
          },
        }
      ),
      // Obtener solo la descripción en español
      fetch(
        `${TMDB_BASE_URL}/movie/${id}?language=es-MX`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
            'Content-Type': 'application/json',
          },
        }
      )
    ]);

    if (!responseEN.ok) {
      throw new Error(`TMDb API error: ${responseEN.status}`);
    }

    const dataEN = await responseEN.json();
    const dataES = responseES.ok ? await responseES.json() : null;

    // Combinar: usar datos en inglés pero overview en español si está disponible
    const data = {
      ...dataEN,
      overview: dataES?.overview || dataEN.overview // Priorizar descripción en español
    };

    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching movie details:', error);
    return NextResponse.json(
      { error: 'Error al obtener detalles de la película' },
      { status: 500 }
    );
  }
}