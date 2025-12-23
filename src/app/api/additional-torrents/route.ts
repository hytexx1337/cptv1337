import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { searchAllAdditionalSources } from '@/lib/additional-torrent-apis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, season, episode } = body;

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    logger.log('🔍 API: Buscando torrents adicionales para:', query);

    const seasonNum = season ? parseInt(season) : undefined;
    const episodeNum = episode ? parseInt(episode) : undefined;

    const results = await searchAllAdditionalSources(query, seasonNum, episodeNum);

    logger.log('✅ API: Encontrados', results.length, 'torrents adicionales');

    return NextResponse.json({
      success: true,
      streams: results,
      count: results.length
    });

  } catch (error) {
    logger.error('❌ API Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to search additional torrent sources',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}