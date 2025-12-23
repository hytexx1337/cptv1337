import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imdbId = searchParams.get('imdb_id');
  const season = searchParams.get('season');
  const episode = searchParams.get('episode');

  if (!imdbId || !season || !episode) {
    return NextResponse.json(
      { error: 'Missing required parameters: imdb_id, season, episode' },
      { status: 400 }
    );
  }

  try {
    // Construir la URL de EZTV API
    const eztvUrl = `https://eztv.re/api/get-torrents?imdb_id=${imdbId}&season=${season}&episode=${episode}&limit=100`;
    
    const response = await fetch(eztvUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`EZTV API error: ${response.status}`);
    }

    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching EZTV torrents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch torrents from EZTV' },
      { status: 500 }
    );
  }
}