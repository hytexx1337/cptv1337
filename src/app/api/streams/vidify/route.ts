import { NextRequest, NextResponse } from 'next/server';
import { fetchAllVidifyStreams, fetchVidifyStream, VIDIFY_SERVERS } from '@/lib/vidify-crypto';

/**
 * API Route para obtener streams de Vidify
 * 
 * GET /api/streams/vidify?tmdbId=127532&type=tv&season=1&episode=5
 * GET /api/streams/vidify?tmdbId=127532&type=movie
 * GET /api/streams/vidify?tmdbId=127532&type=tv&season=1&episode=5&server=Adam
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tmdbId = searchParams.get('tmdbId');
    const type = searchParams.get('type') as 'movie' | 'tv' || 'tv';
    const season = searchParams.get('season');
    const episode = searchParams.get('episode');
    const serverName = searchParams.get('server');
    
    // Validación
    if (!tmdbId) {
      return NextResponse.json(
        { error: 'tmdbId es requerido' },
        { status: 400 }
      );
    }
    
    if (type === 'tv' && (!season || !episode)) {
      return NextResponse.json(
        { error: 'season y episode son requeridos para series' },
        { status: 400 }
      );
    }
    
    // Si se especifica un servidor, buscar solo ese
    if (serverName) {
      const serverConfig = VIDIFY_SERVERS.find(s => s.name === serverName);
      
      if (!serverConfig) {
        return NextResponse.json(
          { error: `Servidor "${serverName}" no encontrado` },
          { status: 404 }
        );
      }
      
      const result = await fetchVidifyStream(
        tmdbId,
        serverConfig,
        type,
        season ? parseInt(season) : undefined,
        episode ? parseInt(episode) : undefined
      );
      
      if (!result) {
        return NextResponse.json(
          { error: `No se pudo obtener stream de ${serverName}` },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        success: true,
        stream: result
      });
    }
    
    // Obtener todos los streams disponibles
    const streams = await fetchAllVidifyStreams(
      tmdbId,
      type,
      season ? parseInt(season) : undefined,
      episode ? parseInt(episode) : undefined
    );
    
    if (streams.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron streams disponibles' },
        { status: 404 }
      );
    }
    
    // Agrupar por idioma
    const byLanguage = streams.reduce((acc, stream) => {
      if (!acc[stream.language]) {
        acc[stream.language] = [];
      }
      acc[stream.language].push(stream);
      return acc;
    }, {} as Record<string, typeof streams>);
    
    return NextResponse.json({
      success: true,
      total: streams.length,
      streams,
      byLanguage
    });
    
  } catch (error) {
    console.error('[Vidify API] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

