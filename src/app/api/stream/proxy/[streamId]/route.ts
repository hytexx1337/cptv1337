import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL || 'http://81.17.102.98:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ streamId: string }> }
) {
  try {
    const { streamId } = await params;
    const { searchParams } = new URL(request.url);
    
    // Construir URL del servidor de streaming con todos los parámetros
    const streamingUrl = new URL(`${STREAMING_SERVER_URL}/api/stream/${streamId}`);
    searchParams.forEach((value, key) => {
      streamingUrl.searchParams.set(key, value);
    });

    // Obtener headers del request original (especialmente Range para video streaming)
    const headers: Record<string, string> = {};
    
    // Copiar headers importantes para streaming
    const importantHeaders = ['range', 'user-agent', 'accept', 'accept-encoding'];
    importantHeaders.forEach(header => {
      const value = request.headers.get(header);
      if (value) {
        headers[header] = value;
      }
    });

    logger.log(`[PROXY] Streaming ${streamId} from ${streamingUrl.toString()}`);
    logger.log(`[PROXY] Request headers:`, headers);
    
    // Hacer request al servidor de streaming
    const response = await fetch(streamingUrl.toString(), {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      logger.error(`[PROXY] Error from streaming server: ${response.status} ${response.statusText}`);
      return new NextResponse(`Error from streaming server: ${response.status}`, { status: response.status });
    }

    logger.log(`[PROXY] Response from streaming server:`, {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
      acceptRanges: response.headers.get('accept-ranges')
    });

    // Obtener el stream del servidor
    const stream = response.body;
    
    if (!stream) {
      return NextResponse.json(
        { error: 'No se pudo obtener el stream' },
        { status: 500 }
      );
    }

    // Crear response con headers optimizados para Chromecast
    const proxyResponse = new NextResponse(stream, {
      status: response.status,
      statusText: response.statusText,
    });

    // Copiar headers importantes del servidor de streaming
    const headersToProxy = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'last-modified',
      'etag',
      'cache-control'
    ];

    headersToProxy.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        proxyResponse.headers.set(header, value);
      }
    });

    // Headers específicos para Chromecast
    proxyResponse.headers.set('Access-Control-Allow-Origin', '*');
    proxyResponse.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    proxyResponse.headers.set('Access-Control-Allow-Headers', 'Range, User-Agent, Accept, Accept-Encoding');
    proxyResponse.headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
    
    // Asegurar que Accept-Ranges esté presente para video streaming
    if (!proxyResponse.headers.get('accept-ranges')) {
      proxyResponse.headers.set('Accept-Ranges', 'bytes');
    }
    
    // Headers críticos para Chromecast
    proxyResponse.headers.set('X-Content-Type-Options', 'nosniff');
    proxyResponse.headers.set('Connection', 'keep-alive');
    
    // Forzar Content-Type correcto para video si no está presente
    const contentType = proxyResponse.headers.get('content-type');
    if (!contentType || contentType === 'application/octet-stream') {
      // Detectar tipo basado en la URL del stream
      const streamUrl = streamingUrl.toString();
      let detectedType = 'video/mp4'; // Por defecto
      
      if (streamUrl.toLowerCase().includes('.mkv')) {
        detectedType = 'video/x-matroska';
        logger.log(`[PROXY] ⚠️ Archivo MKV detectado - NO compatible con Chromecast`);
      } else if (streamUrl.toLowerCase().includes('.webm')) {
        detectedType = 'video/webm';
      } else if (streamUrl.toLowerCase().includes('.avi')) {
        detectedType = 'video/x-msvideo';
      }
      
      proxyResponse.headers.set('Content-Type', detectedType);
      logger.log(`[PROXY] Forzando Content-Type a ${detectedType} basado en URL`);
    }
    
    // Log para debugging
    logger.log(`[PROXY] Headers para Chromecast:`, {
      'content-type': proxyResponse.headers.get('content-type'),
      'content-length': proxyResponse.headers.get('content-length'),
      'accept-ranges': proxyResponse.headers.get('accept-ranges'),
      'content-range': proxyResponse.headers.get('content-range'),
    });

    return proxyResponse;

  } catch (error) {
    logger.error('[PROXY] Error proxying stream:', error);
    return NextResponse.json(
      { error: 'Error de conexión con el servidor de streaming' },
      { status: 500 }
    );
  }
}

// Manejar OPTIONS para CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, User-Agent, Accept, Accept-Encoding',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// Manejar HEAD requests para metadata
export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ streamId: string }> }
) {
  try {
    const { streamId } = await params;
    const { searchParams } = new URL(request.url);
    
    const streamingUrl = new URL(`${STREAMING_SERVER_URL}/api/stream/${streamId}`);
    searchParams.forEach((value, key) => {
      streamingUrl.searchParams.set(key, value);
    });

    const response = await fetch(streamingUrl.toString(), {
      method: 'HEAD',
    });

    const headResponse = new NextResponse(null, {
      status: response.status,
      statusText: response.statusText,
    });

    // Copiar headers de metadata
    const metadataHeaders = [
      'content-type',
      'content-length',
      'accept-ranges',
      'last-modified',
      'etag'
    ];

    metadataHeaders.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        headResponse.headers.set(header, value);
      }
    });

    // CORS headers
    headResponse.headers.set('Access-Control-Allow-Origin', '*');
    headResponse.headers.set('Access-Control-Expose-Headers', 'Content-Length, Accept-Ranges, Content-Type');

    return headResponse;

  } catch (error) {
    logger.error('[PROXY] Error in HEAD request:', error);
    return new NextResponse(null, { status: 500 });
  }
}