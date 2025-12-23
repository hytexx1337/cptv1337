import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL || 'http://81.17.102.98:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ streamId: string; index: string }> }
) {
  try {
    const { streamId, index } = await params;

    // Proxy al servidor de streaming real
    const response = await fetch(`${STREAMING_SERVER_URL}/api/torrent/subtitle/${streamId}/${index}`);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Error al obtener subtítulo' },
        { status: response.status }
      );
    }

    // Mantener el Content-Type original (puede ser text/vtt, etc)
    const contentType = response.headers.get('content-type') || 'text/plain';
    const content = await response.text();
    
    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    logger.error('Error proxying torrent subtitle:', error);
    return NextResponse.json(
      { error: 'Error de conexión' },
      { status: 500 }
    );
  }
}

