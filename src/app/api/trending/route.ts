import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';

    const response = await fetch(
      `${TMDB_BASE_URL}/trending/all/week?page=${page}&language=en-US&include_adult=false`,
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
    
    // Filtrar contenido adulto manualmente ya que /trending no soporta include_adult
    const filteredResults = data.results?.filter((item: any) => {
      // Filtro 1: Flag adulto
      if (item.adult === true) return false;
      
      // Filtro 2: Rechazar contenido con muy pocos votos (probablemente basura o contenido adulto no marcado)
      // Las películas/series legítimas suelen tener más de 10 votos
      if (item.vote_count < 10) return false;
      
      // Filtro 3: Géneros sospechosos con bajo vote_count
      const suspiciousGenres = [10749]; // Romance
      if (item.genre_ids?.some((id: number) => suspiciousGenres.includes(id)) && item.vote_count < 100) {
        return false;
      }
      
      // Filtro 4: Títulos con palabras sospechosas (case insensitive)
      const suspiciousKeywords = ['sex', 'porn', 'xxx', 'adult', 'erotic', 'エロ', 'セックス', '19+', '섹시', '성인'];
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
    logger.error('Error fetching trending content:', error);
    return NextResponse.json(
      { error: 'Error al obtener contenido trending' },
      { status: 500 }
    );
  }
}