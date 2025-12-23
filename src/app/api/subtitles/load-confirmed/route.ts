import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface LoadConfirmedRequest {
  movieTitle?: string;
  imdbId?: string;
  tmdbId?: string | number;
  season?: number;
  episode?: number;
  isTV?: boolean;
  movieHash?: string;
}

export async function POST(request: NextRequest) {
  try {
    const requestData: LoadConfirmedRequest = await request.json();
    
    // Crear identificador único para el contenido
    const contentId = requestData.isTV 
      ? `${requestData.tmdbId || requestData.imdbId}_S${requestData.season}E${requestData.episode}`
      : `${requestData.tmdbId || requestData.imdbId}`;

    logger.log('🔍 [LOAD-CONFIRMED-API] Buscando subtítulos confirmados:', {
      contentId,
      movieTitle: requestData.movieTitle,
      isTV: requestData.isTV,
      season: requestData.season,
      episode: requestData.episode
    });

    logger.log(`🔍 [LOAD-CONFIRMED] Buscando subtítulos confirmados para contentId: ${contentId}`);

    // Cargar desde streaming-server local
    const vpsResponse = await fetch(`${process.env.VPS_ENDPOINT}/api/subtitles/confirmed/${contentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!vpsResponse.ok) {
      logger.log('No se encontraron subtítulos confirmados en VPS para:', contentId);
      return NextResponse.json({ subtitles: null }, { status: 200 });
    }

    const vpsResult = await vpsResponse.json();
    logger.log('✅ [LOAD-CONFIRMED] Subtítulos cargados desde VPS:', vpsResult);
    
    return NextResponse.json(vpsResult, { status: 200 });

  } catch (error) {
    logger.error('❌ [LOAD-CONFIRMED-API] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}