import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    logger.log(`📸 [IMAGES API] Solicitando imágenes para TV ${id}`);
    
    const response = await fetch(
      `${TMDB_BASE_URL}/tv/${id}/images?api_key=${TMDB_API_KEY}&include_image_language=en,null`,
      { next: { revalidate: 0 } } // Sin caché temporalmente para actualizar
    );

    if (!response.ok) {
      throw new Error('Failed to fetch TV show images');
    }

    const data = await response.json();
    
    logger.log(`📸 [IMAGES API] TV ${id} - Logos totales recibidos: ${data.logos?.length || 0}`);
    
    // Log de idiomas de logos
    if (data.logos && data.logos.length > 0) {
      const languages = data.logos.map((l: any) => l.iso_639_1 || 'null');
      logger.log(`📸 [IMAGES API] Idiomas de logos: ${languages.join(', ')}`);
    }
    
    // Filtrar solo logos en inglés del lado del servidor
    if (data.logos) {
      const originalCount = data.logos.length;
      data.logos = data.logos.filter((logo: any) => logo.iso_639_1 === 'en');
      logger.log(`🎨 [IMAGES API] TV ${id} - Logos filtrados: ${originalCount} -> ${data.logos.length} (solo 'en')`);
    }
    
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching TV show images:', error);
    return NextResponse.json(
      { error: 'Failed to fetch TV show images' },
      { status: 500 }
    );
  }
}

