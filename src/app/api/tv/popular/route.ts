import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';

    const response = await fetch(
      `${TMDB_BASE_URL}/tv/popular?page=${page}&language=en-US&include_adult=false`,
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
    
    // Filtrar contenido adulto manualmente con múltiples criterios
    const filteredResults = data.results?.filter((item: any) => {
      if (item.adult === true) return false;
      
      // Rechazar contenido con muy pocos votos (probablemente basura)
      if (item.vote_count < 10) return false;
      
      const suspiciousKeywords = ['sex', 'porn', 'xxx', 'adult', 'erotic', 'エロ', 'セックス', '19+', '섹시', '성인', 'playboy', 'penthouse'];
      const name = (item.name || '').toLowerCase();
      const originalName = (item.original_name || '').toLowerCase();
      
      if (suspiciousKeywords.some(keyword => 
        name.includes(keyword) || originalName.includes(keyword)
      )) {
        return false;
      }
      
      return true;
    }) || [];
    
    return NextResponse.json({ ...data, results: filteredResults });
  } catch (error) {
    logger.error('Error fetching popular TV shows:', error);
    return NextResponse.json(
      { error: 'Error al obtener series populares' },
      { status: 500 }
    );
  }
}