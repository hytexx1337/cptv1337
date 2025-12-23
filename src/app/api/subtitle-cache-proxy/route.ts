import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL || 'http://81.17.102.98:3001';

// GET - Obtener subtítulo del caché
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get('hash');
    const language = searchParams.get('language');
    
    if (!hash || !language) {
      return NextResponse.json(
        { error: 'Hash and language parameters are required' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${STREAMING_SERVER_URL}/api/subtitle-cache?hash=${encodeURIComponent(hash)}&language=${encodeURIComponent(language)}`
    );

    if (response.status === 404) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Error al obtener subtítulo del caché' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error proxying subtitle cache GET:', error);
    return NextResponse.json(
      { error: 'Error de conexión' },
      { status: 500 }
    );
  }
}

// POST - Guardar subtítulo en caché
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const response = await fetch(`${STREAMING_SERVER_URL}/api/subtitle-cache`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Error al guardar subtítulo en caché' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error proxying subtitle cache POST:', error);
    return NextResponse.json(
      { error: 'Error de conexión' },
      { status: 500 }
    );
  }
}

// DELETE - Limpiar caché
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const all = searchParams.get('all');
    
    const url = all ? `${STREAMING_SERVER_URL}/api/subtitle-cache?all=true` : `${STREAMING_SERVER_URL}/api/subtitle-cache`;
    
    const response = await fetch(url, {
      method: 'DELETE',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Error al limpiar caché' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error proxying subtitle cache DELETE:', error);
    return NextResponse.json(
      { error: 'Error de conexión' },
      { status: 500 }
    );
  }
}

