import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imdbId = searchParams.get('imdb_id');
  const limit = searchParams.get('limit') || '100';

  if (!imdbId) {
    return NextResponse.json({ error: 'IMDB ID is required' }, { status: 400 });
  }

  try {
    logger.log('🔍 [EZTV PROXY] Buscando torrents para IMDB ID:', imdbId);
    
    const response = await fetch(`https://eztv.re/api/get-torrents?imdb_id=${imdbId}&limit=${limit}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      logger.error('❌ [EZTV PROXY] Error HTTP:', response.status, response.statusText);
      return NextResponse.json(
        { error: `EZTV API error: ${response.status}` }, 
        { status: response.status }
      );
    }

    const data = await response.json();
    logger.log('✅ [EZTV PROXY] Torrents encontrados:', data.torrents?.length || 0);

    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });

  } catch (error: any) {
    logger.error('❌ [EZTV PROXY] Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch from EZTV API', details: error.message }, 
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}