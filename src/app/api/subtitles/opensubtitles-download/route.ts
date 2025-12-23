import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const OPENSUBTITLES_API_KEY = 'In5dMesLzsWSQvBLAMJtB6ajMUDklz5n';
const OPENSUBTITLES_BASE_URL = 'https://api.opensubtitles.com/api/v1';

// Función para convertir SRT a VTT
function convertSRTtoVTT(srtContent: string): string {
  try {
    let vttContent = 'WEBVTT\n\n';
    const lines = srtContent.split(/\r?\n/);
    const timestampRegex = /^\d{2}:\d{2}:\d{2}[,.:]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.:]\d{3}$/;

    const result: string[] = [];
    let currentSubtitle: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine === '') {
        if (currentSubtitle.length > 0) {
          const hasValidTimestamp = currentSubtitle.some(l => timestampRegex.test(l));
          const hasText = currentSubtitle.some(l => 
            !timestampRegex.test(l) && !/^\d+$/.test(l) && l.trim() !== ''
          );

          if (hasValidTimestamp && hasText) {
            const processedLines = currentSubtitle
              .filter(l => !/^\d+$/.test(l))
              .map(l => l.replace(/,(\d{3})/g, '.$1'));
            
            result.push(processedLines.join('\n'));
          }
          currentSubtitle = [];
        }
      } else {
        currentSubtitle.push(trimmedLine);
      }
    }

    if (currentSubtitle.length > 0) {
      const hasValidTimestamp = currentSubtitle.some(l => timestampRegex.test(l));
      const hasText = currentSubtitle.some(l => 
        !timestampRegex.test(l) && !/^\d+$/.test(l) && l.trim() !== ''
      );

      if (hasValidTimestamp && hasText) {
        const processedLines = currentSubtitle
          .filter(l => !/^\d+$/.test(l))
          .map(l => l.replace(/,(\d{3})/g, '.$1'));
        
        result.push(processedLines.join('\n'));
      }
    }

    vttContent += result.join('\n\n');
    return vttContent;
  } catch (error) {
    logger.error('Error converting SRT to VTT:', error);
    throw error;
  }
}

// Función para guardar archivo VTT en disco
async function saveVTTFile(content: string, originalName: string): Promise<string> {
  try {
    const subtitlesDir = join(process.cwd(), 'public', 'subtitles');
    const fileName = `${Date.now()}_${originalName.replace(/[^a-zA-Z0-9.-]/g, '_')}.vtt`;
    const filePath = join(subtitlesDir, fileName);
    
    await mkdir(subtitlesDir, { recursive: true });
    await writeFile(filePath, content, 'utf8');
    
    return `/subtitles/${fileName}`;
  } catch (error) {
    logger.error('Error saving VTT file:', error);
    throw error;
  }
}

// Función para guardar archivo SRT en disco
async function saveSRTFile(content: string, originalName: string): Promise<string> {
  try {
    const subtitlesDir = join(process.cwd(), 'public', 'subtitles');
    const fileName = `${Date.now()}_${originalName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = join(subtitlesDir, fileName);
    
    await mkdir(subtitlesDir, { recursive: true });
    await writeFile(filePath, content, 'utf8');
    
    return `/subtitles/${fileName}`;
  } catch (error) {
    logger.error('Error saving SRT file:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { file_id } = body;
    
    if (!file_id) {
      return NextResponse.json(
        { error: 'file_id is required' },
        { status: 400 }
      );
    }

    logger.log('📥 OpenSubtitles Download Proxy - File ID:', file_id);
    
    // Make request to OpenSubtitles download endpoint
    const downloadUrl = `${OPENSUBTITLES_BASE_URL}/download`;
    
    logger.log('📡 Making download request to OpenSubtitles:', downloadUrl);
    
    const step1Start = Date.now();
    const response = await fetch(downloadUrl, {
      method: 'POST',
      headers: {
        'Api-Key': OPENSUBTITLES_API_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'TorrentStreamer v1.0',
      },
      body: JSON.stringify({ file_id }),
      signal: AbortSignal.timeout(8000), // 8 segundos timeout para obtener el link
    });

    const step1Time = Date.now() - step1Start;
    logger.log(`📊 OpenSubtitles Download Response Status: ${response.status} (${step1Time}ms)`);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ OpenSubtitles Download API Error:', response.status, response.statusText, errorText);
      
      return NextResponse.json(
        { 
          error: 'OpenSubtitles Download API Error', 
          status: response.status, 
          message: errorText 
        },
        { status: response.status }
      );
    }

    const downloadData = await response.json();
    logger.log('✅ OpenSubtitles Download Success - Link obtained');

    // If we got a download link, fetch the actual SRT content
    if (downloadData.link) {
      logger.log('📥 Fetching SRT content from:', downloadData.link);
      
      const step2Start = Date.now();
      const srtResponse = await fetch(downloadData.link, {
        signal: AbortSignal.timeout(10000), // 10 segundos timeout para descargar el archivo
      });
      
      const step2Time = Date.now() - step2Start;
      
      if (srtResponse.ok) {
        const srtContent = await srtResponse.text();
        const totalTime = Date.now() - startTime;
        logger.log(`✅ SRT content fetched successfully (download: ${step2Time}ms, total: ${totalTime}ms)`);
        
        // Guardar SRT original sin convertir (mejor compatibilidad con ExoPlayer en Android TV)
        logger.log('💾 Saving original SRT file...');
        const fileName = downloadData.file_name || 'subtitle.srt';
        const srtPath = await saveSRTFile(srtContent, fileName);
        logger.log(`✅ SRT saved to disk: ${srtPath}`);
        
        // Convertir SRT a VTT para el player web
        const vttContent = convertSRTtoVTT(srtContent);
        logger.log(`✅ VTT converted, size: ${vttContent.length}`);
        
        // Retornar contenido VTT + URL del SRT original
        return NextResponse.json({
          success: true,
          content: vttContent, // Contenido VTT para el player web
          filePath: srtPath,
          fileName: fileName,
          size: srtContent.length,
          format: 'srt',
        }, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'X-Download-Time': `${totalTime}ms`,
          },
        });
      } else {
        logger.error(`❌ Failed to fetch SRT content: ${srtResponse.status} (${step2Time}ms)`);
        return NextResponse.json(
          { error: 'Failed to fetch SRT content', status: srtResponse.status },
          { status: 500 }
        );
      }
    } else {
      logger.error('❌ No download link in response');
      return NextResponse.json(
        { error: 'No download link received from OpenSubtitles' },
        { status: 500 }
      );
    }

  } catch (error) {
    const totalTime = Date.now() - startTime;
    
    if (error instanceof Error && error.name === 'TimeoutError') {
      logger.error(`❌ Download timeout after ${totalTime}ms`);
      return NextResponse.json(
        { 
          error: 'Download Timeout', 
          message: `Subtitle download exceeded timeout (${totalTime}ms)` 
        },
        { status: 504 }
      );
    }
    
    logger.error(`❌ OpenSubtitles Download Proxy Error (${totalTime}ms):`, error);
    
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        message: error instanceof Error ? error.message : 'Unknown error',
        elapsed: `${totalTime}ms`
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}