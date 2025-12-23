import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL || 'http://81.17.102.98:3002'; // ✅ Cambiar a puerto 3002 para hybrid-streaming-server

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    logger.log('🎬 [STREAM-START] Iniciando stream:', {
      magnetUri: body.magnetUri ? `${body.magnetUri.substring(0, 60)}...` : 'N/A',
      fileIndex: body.fileIndex
    });
    
    // Proxy al servidor de streaming real con timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 segundos timeout
    
    const response = await fetch(`${STREAMING_SERVER_URL}/api/stream/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ [STREAM-START] Streaming server error:', errorText);
      
      // Intentar parsear el error
      let errorMessage = 'Error al iniciar el streaming';
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error) {
          errorMessage = errorData.error;
          
          // Si el error es "client is destroyed", dar más contexto
          if (errorMessage.includes('client is destroyed')) {
            errorMessage = 'El servidor de streaming se reinició. Por favor, intenta nuevamente.';
          }
        }
      } catch {
        // Si no se puede parsear, usar el texto tal cual
        errorMessage = errorText || errorMessage;
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    logger.log('✅ [STREAM-START] Stream iniciado:', {
      streamId: data.streamId,
      playlistUrl: data.playlistUrl ? 'OK' : 'N/A'
    });
    
    return NextResponse.json(data);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.error('⏱️ [STREAM-START] Timeout después de 30 segundos');
      return NextResponse.json(
        { error: 'El servidor de streaming tardó demasiado en responder. Intenta nuevamente.' },
        { status: 504 }
      );
    }
    
    logger.error('❌ [STREAM-START] Error proxying stream start:', error);
    return NextResponse.json(
      { error: 'Error de conexión con el servidor de streaming' },
      { status: 500 }
    );
  }
}

