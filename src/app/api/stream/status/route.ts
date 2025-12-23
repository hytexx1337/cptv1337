import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL || 'http://81.17.102.98:3001';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get('hash');
    
    if (!hash) {
      return NextResponse.json(
        { error: 'Hash parameter is required' },
        { status: 400 }
      );
    }

    // Proxy al servidor de streaming real
    const response = await fetch(`${STREAMING_SERVER_URL}/api/stream/status?hash=${encodeURIComponent(hash)}`);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Error al obtener estado del streaming' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error proxying stream status:', error);
    return NextResponse.json(
      { error: 'Error de conexión con el servidor de streaming' },
      { status: 500 }
    );
  }
}

