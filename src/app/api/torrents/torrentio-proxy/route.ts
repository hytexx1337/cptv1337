import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy para Torrentio - Soluciona problemas de conectividad desde Android TV
 * 
 * La app se conecta al VPS (que ya funciona) y el VPS hace el request a Torrentio
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imdbId = searchParams.get('imdbId');
    const type = searchParams.get('type'); // 'movie' | 'series'
    const season = searchParams.get('season');
    const episode = searchParams.get('episode');

    if (!imdbId || !type) {
      return NextResponse.json(
        { error: 'Faltan parámetros: imdbId y type son requeridos' },
        { status: 400 }
      );
    }

    // Construir URL de Torrentio con todos los proveedores
    const providers = [
      'yts', 'eztv', 'rarbg', '1337x', 'thepiratebay', 'kickasstorrents',
      'torrentgalaxy', 'magnetdl', 'nyaasi', 'horriblesubs', 'anidex',
      'tokyotosho', 'rutor', 'rutracker', 'comando', 'bludv', 'torrent9',
      'ilcorsaronero', 'mejortorrent', 'wolfmax4k', 'cinecalidad', 'besttorrents'
    ].join(',');

    let torrentioUrl: string;
    
    if (type === 'series' && season && episode) {
      torrentioUrl = `https://torrentio.strem.fun/providers=${providers}|sort=qualitysize/stream/series/${imdbId}:${season}:${episode}.json`;
    } else {
      torrentioUrl = `https://torrentio.strem.fun/providers=${providers}|sort=qualitysize/stream/movie/${imdbId}.json`;
    }

    console.log('🔄 [TORRENTIO-PROXY] Proxying request:', torrentioUrl);

    // Hacer el request a Torrentio desde el servidor
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(torrentioUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error('❌ [TORRENTIO-PROXY] Torrentio error:', response.status, response.statusText);
      return NextResponse.json(
        { error: `Torrentio HTTP ${response.status}: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`✅ [TORRENTIO-PROXY] Success: ${data.streams?.length || 0} streams`);

    // Retornar los datos tal cual vienen de Torrentio
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('❌ [TORRENTIO-PROXY] Error:', error);

    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Timeout: Torrentio tardó más de 30 segundos en responder' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Error desconocido al contactar Torrentio' },
      { status: 500 }
    );
  }
}

