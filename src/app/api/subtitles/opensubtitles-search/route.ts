import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

const OPENSUBTITLES_API_KEY = 'In5dMesLzsWSQvBLAMJtB6ajMUDklz5n';
const OPENSUBTITLES_BASE_URL = 'https://api.opensubtitles.com/api/v1';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Log the incoming request for debugging
    logger.log('🔍 OpenSubtitles Search Proxy - Incoming params:', Object.fromEntries(searchParams.entries()));
    
    // Forward all search parameters to OpenSubtitles API
    const opensubtitlesUrl = `${OPENSUBTITLES_BASE_URL}/subtitles?${searchParams.toString()}`;
    
    logger.log('📡 Making request to OpenSubtitles:', opensubtitlesUrl);
    
    const response = await fetch(opensubtitlesUrl, {
      method: 'GET',
      headers: {
        'Api-Key': OPENSUBTITLES_API_KEY,
        'User-Agent': 'TorrentStreamer v1.0',
      },
    });

    logger.log('📊 OpenSubtitles Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ OpenSubtitles API Error:', response.status, response.statusText, errorText);
      
      return NextResponse.json(
        { 
          error: 'OpenSubtitles API Error', 
          status: response.status, 
          message: errorText 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    logger.log('✅ OpenSubtitles Search Success - Results:', data.total_count);

    // Return the data with proper CORS headers
    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    logger.error('❌ OpenSubtitles Search Proxy Error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

// Handle preflight OPTIONS requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}