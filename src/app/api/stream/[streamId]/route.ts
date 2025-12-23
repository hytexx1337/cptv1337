import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL || 'http://81.17.102.98:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ streamId: string }> }
) {
  try {
    const { streamId } = await params;
    
    // Obtener el header Range para streaming de video
    const range = request.headers.get('range');
    
    // Obtener el User-Agent del cliente (IMPORTANTE para detección de Chrome/Brave)
    const userAgent = request.headers.get('user-agent');
    
    // Construir headers para el proxy
    const headers: HeadersInit = {};
    if (range) {
      headers['Range'] = range;
    }
    if (userAgent) {
      headers['User-Agent'] = userAgent;
    }

    // Proxy al servidor de streaming real
    const response = await fetch(
      `${STREAMING_SERVER_URL}/api/stream/${streamId}`,
      { headers }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Error al obtener stream' },
        { status: response.status }
      );
    }

    // Obtener el body como stream
    const body = response.body;
    if (!body) {
      return NextResponse.json(
        { error: 'No stream body' },
        { status: 500 }
      );
    }

    // Copiar headers importantes del servidor de streaming
    const responseHeaders = new Headers();
    
    // Content-Type
    const contentType = response.headers.get('content-type');
    if (contentType) {
      responseHeaders.set('Content-Type', contentType);
    }
    
    // Content-Length
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }
    
    // Content-Range (para streaming parcial)
    const contentRange = response.headers.get('content-range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }
    
    // Accept-Ranges
    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) {
      responseHeaders.set('Accept-Ranges', acceptRanges);
    }

    // Retornar el stream con el status code correcto (206 para partial content, 200 para completo)
    return new NextResponse(body as any, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error) {
    logger.error('Error proxying video stream:', error);
    return NextResponse.json(
      { error: 'Error de conexión' },
      { status: 500 }
    );
  }
}

