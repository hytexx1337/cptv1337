import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { movieTitle, language = 'spanish', titleIndex, releaseIndex } = body;
    
    if (!movieTitle) {
      return NextResponse.json(
        { error: 'El parámetro movieTitle es requerido' },
        { status: 400 }
      );
    }

    logger.log(`⬇️ Descarga de subtítulos deshabilitada para: "${movieTitle}"`);

    // Subscene scraper ha sido removido - retornar error informativo
    return NextResponse.json(
      { 
        error: 'Servicio de descarga de Subscene no disponible',
        message: 'El servicio de descarga de subtítulos desde Subscene ha sido deshabilitado'
      },
      { status: 503 }
    );

  } catch (error) {
    logger.error('❌ Error en endpoint de descarga:', error);
    return NextResponse.json(
      { 
        error: 'Error en el servicio de descarga',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const movieTitle = searchParams.get('title');
    const language = searchParams.get('language') || 'spanish';
    
    if (!movieTitle) {
      return NextResponse.json(
        { error: 'El parámetro title es requerido' },
        { status: 400 }
      );
    }

    logger.log(`⬇️ Descarga automática deshabilitada para: "${movieTitle}"`);

    // Subscene scraper ha sido removido - retornar error informativo
    return NextResponse.json(
      { 
        error: 'Servicio de descarga automática no disponible',
        message: 'El servicio de descarga automática de subtítulos desde Subscene ha sido deshabilitado'
      },
      { status: 503 }
    );

  } catch (error) {
    logger.error('❌ Error en descarga automática:', error);
    return NextResponse.json(
      { 
        error: 'Error en el servicio de descarga automática',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}