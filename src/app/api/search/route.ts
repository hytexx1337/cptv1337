import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const page = searchParams.get('page') || '1';

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${TMDB_BASE_URL}/search/multi?query=${encodeURIComponent(query)}&page=${page}&language=en-US&include_adult=false`,
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
      const title = (item.title || item.name || '').toLowerCase();
      const originalTitle = (item.original_title || item.original_name || '').toLowerCase();
      
      if (suspiciousKeywords.some(keyword => 
        title.includes(keyword) || originalTitle.includes(keyword)
      )) {
        return false;
      }
      
      return true;
    }) || [];
    
    return NextResponse.json({ ...data, results: filteredResults });
  } catch (error) {
    logger.error('Error searching content:', error);
    return NextResponse.json(
      { error: 'Error al buscar contenido' },
      { status: 500 }
    );
  }
}