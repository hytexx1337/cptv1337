import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VPS_VIDLINK_API = process.env.VPS_VIDLINK_API_URL || 'http://81.17.102.98:8787';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'movie';
  const id = searchParams.get('id');
  const season = searchParams.get('season');
  const episode = searchParams.get('episode');
  const skipCache = searchParams.get('skipCache');

  if (!id) {
    return NextResponse.json({ error: 'Falta parámetro id (TMDB)' }, { status: 400 });
  }

  try {
    console.log(`🔄 [VIDLINK-PROXY] Redirigiendo a VPS: ${type} ${id} ${season ? `S${season}E${episode}` : ''}`);
    
    // Construir URL del VPS
    const vpsUrl = new URL(`${VPS_VIDLINK_API}/extract`);
    vpsUrl.searchParams.set('type', type);
    vpsUrl.searchParams.set('id', id);
    if (season) vpsUrl.searchParams.set('season', season);
    if (episode) vpsUrl.searchParams.set('episode', episode);
    
    const startTime = Date.now();
    
    // Llamar al VPS
    const response = await fetch(vpsUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(60000), // 60 segundos
    });
    
    const elapsed = Date.now() - startTime;
    
    if (!response.ok) {
      console.error(`❌ [VIDLINK-PROXY] Error del VPS: ${response.status} (${elapsed}ms)`);
      const errorData = await response.json().catch(() => ({ error: 'VPS error' }));
      return NextResponse.json(errorData, { status: response.status });
    }
    
    const data = await response.json();
    
    console.log(`✅ [VIDLINK-PROXY] Respuesta del VPS en ${elapsed}ms | Subtitles: ${data.subtitles?.length || 0}`);
    
    // Devolver la misma estructura que antes
    return NextResponse.json({
      streamUrl: data.streamUrl,
      sourceUrl: data.sourceUrl,
      type: data.type,
      id: data.id,
      season: data.season,
      episode: data.episode,
      subtitles: data.subtitles || [],
      cached: data.cached || false,
      provider: 'vidlink',
      vpsTimeMs: elapsed
    });
    
  } catch (error: any) {
    console.error('❌ [VIDLINK-PROXY] Error:', error.message);
    return NextResponse.json(
      { error: 'Error conectando con VPS de Vidlink', message: error.message },
      { status: 500 }
    );
  }
}
