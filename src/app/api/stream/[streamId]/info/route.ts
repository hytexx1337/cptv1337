import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL || 'http://81.17.102.98:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ streamId: string }> }
) {
  try {
    const { streamId } = await params;

    // Proxy al servidor de streaming real
    const response = await fetch(`${STREAMING_SERVER_URL}/api/stream/${streamId}/info`);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Error al obtener información del stream' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error proxying stream info:', error);
    return NextResponse.json(
      { error: 'Error de conexión' },
      { status: 500 }
    );
  }
}

