import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { vttContent, language = 'es' } = await request.json();
    
    if (!vttContent) {
      return NextResponse.json({ error: 'Contenido VTT requerido' }, { status: 400 });
    }

    // Crear respuesta con headers apropiados para WebVTT
    const response = new NextResponse(vttContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Content-Disposition': `inline; filename="subtitles_${language}.vtt"`,
        'Cache-Control': 'public, max-age=3600', // Cache por 1 hora
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

    return response;

  } catch (error) {
    logger.error('❌ Error sirviendo subtítulos:', error);
    return NextResponse.json({ 
      error: 'Error sirviendo archivo de subtítulos',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}

// Manejar preflight requests para CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}