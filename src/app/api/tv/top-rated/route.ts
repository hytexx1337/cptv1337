import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET() {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/tv/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=1&include_adult=false`,
      { next: { revalidate: 3600 } }
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
    logger.error('Error fetching top rated TV shows:', error);
    return NextResponse.json(
      { error: 'Failed to fetch top rated TV shows' },
      { status: 500 }
    );
  }
}

