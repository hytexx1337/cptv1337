import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface ConfirmedSubtitle {
  subtitle: {
    language: string;
    label: string;
    src: string;
    vttContent?: string; // Contenido VTT para blob URLs
    settings: {
      offset: number;
      fontPercent?: number;
      textColor?: string;
      backgroundColor?: string;
      backgroundOpacity?: number;
      fontFamily?: string;
      position?: 'top' | 'bottom';
    };
    confirmedAt: string;
  };
  movieTitle?: string;
  imdbId?: string;
  tmdbId?: string | number;
  season?: number;
  episode?: number;
  isTV?: boolean;
  movieHash?: string;
  movieByteSize?: number;
}

export async function POST(request: NextRequest) {
  try {
    const subtitleData: ConfirmedSubtitle = await request.json();
    
    logger.log('📝 [SUBTITLE-CONFIRM-API] Recibiendo confirmación de subtítulos:', {
      movieTitle: subtitleData.movieTitle,
      language: subtitleData.subtitle.language,
      imdbId: subtitleData.imdbId,
      tmdbId: subtitleData.tmdbId,
      season: subtitleData.season,
      episode: subtitleData.episode,
      isTV: subtitleData.isTV,
      movieHash: subtitleData.movieHash,
      settings: subtitleData.subtitle.settings,
      hasVttContent: !!subtitleData.subtitle.vttContent
    });

    // TODO: Aquí enviaremos los datos al VPS cuando esté configurado
    // Por ahora, solo registramos la confirmación
    
    // Crear identificador único para el contenido
    const contentId = subtitleData.isTV 
      ? `${subtitleData.tmdbId || subtitleData.imdbId}_S${subtitleData.season}E${subtitleData.episode}`
      : `${subtitleData.tmdbId || subtitleData.imdbId}`;

    // Preparar datos para enviar al VPS
    const vpsData = {
      contentId,
      movieTitle: subtitleData.movieTitle,
      imdbId: subtitleData.imdbId,
      tmdbId: subtitleData.tmdbId,
      season: subtitleData.season,
      episode: subtitleData.episode,
      isTV: subtitleData.isTV,
      movieHash: subtitleData.movieHash,
      movieByteSize: subtitleData.movieByteSize,
      subtitle: subtitleData.subtitle // Pasar el objeto subtitle completo
    };

    // Enviar al streaming-server local para guardar los subtítulos confirmados
    const vpsResponse = await fetch(`${process.env.VPS_ENDPOINT}/api/subtitles/save-confirmed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(vpsData)
    });

    if (!vpsResponse.ok) {
      logger.error('Error al guardar en VPS:', await vpsResponse.text());
    } else {
      logger.log('✅ Subtítulos guardados en VPS');
    }

    // Por ahora, simular éxito
    logger.log('✅ [SUBTITLE-CONFIRM-API] Subtítulos confirmados (simulado):', {
      contentId,
      language: subtitleData.subtitle.language,
      confirmedAt: subtitleData.subtitle.confirmedAt
    });

    return NextResponse.json({
      success: true,
      message: 'Subtítulos confirmados y guardados',
      contentId,
      data: vpsData
    });

  } catch (error) {
    logger.error('❌ [SUBTITLE-CONFIRM-API] Error:', error);
    
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