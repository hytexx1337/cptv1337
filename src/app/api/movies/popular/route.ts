import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';

    const response = await fetch(
      `${TMDB_BASE_URL}/movie/popular?page=${page}&language=en-US&include_adult=false`,
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
      
      const suspiciousKeywords = ['sex', 'porn', 'xxx', 'adult', 'erotic', 'エロ', 'セックス', '19+', '섹시', '성인', 'playboy', 'penthouse', 'softcore'];
      const title = (item.title || '').toLowerCase();
      const originalTitle = (item.original_title || '').toLowerCase();
      
      if (suspiciousKeywords.some(keyword => 
        title.includes(keyword) || originalTitle.includes(keyword)
      )) {
        return false;
      }
      
      return true;
    }) || [];
    
    // Agregar media_type a cada película para que MediaCard las identifique correctamente
    const moviesWithType = {
      ...data,
      results: filteredResults.map((movie: any) => ({
        ...movie,
        media_type: 'movie'
      }))
    };
    
    return NextResponse.json(moviesWithType);
  } catch (error) {
    logger.error('Error fetching popular movies:', error);
    return NextResponse.json(
      { error: 'Error al obtener películas populares' },
      { status: 500 }
    );
  }
}