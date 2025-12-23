import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { validateUrl, sanitizeForCommand } from '@/lib/input-validator';

interface SubtitleStream {
  index: number;
  codec_name: string;
  codec_type: string;
  tags?: {
    language?: string;
    title?: string;
  };
}

interface FFProbeResponse {
  streams: SubtitleStream[];
}

export async function POST(request: NextRequest) {
  try {
    const { videoUrl } = await request.json();
    
    if (!videoUrl) {
      return NextResponse.json({ error: 'URL del video requerida' }, { status: 400 });
    }

    // 🔒 VALIDAR INPUT PARA PREVENIR COMMAND INJECTION
    try {
      validateUrl(videoUrl, true); // Permitir URLs privadas (streaming interno)
      sanitizeForCommand(videoUrl); // Verificar caracteres peligrosos
    } catch (validationError) {
      logger.error('❌ Validación de input falló:', validationError);
      return NextResponse.json({ 
        error: 'Input inválido',
        details: validationError instanceof Error ? validationError.message : 'Validación falló'
      }, { status: 400 });
    }

    logger.log('🔍 Detectando subtítulos embebidos en:', videoUrl);

    // Usar FFprobe para obtener información de streams
    const subtitleStreams = await detectEmbeddedSubtitles(videoUrl);
    
    return NextResponse.json({
      success: true,
      subtitles: subtitleStreams,
      hasEmbeddedSubtitles: subtitleStreams.length > 0
    });

  } catch (error) {
    logger.error('❌ Error detectando subtítulos:', error);
    return NextResponse.json({ 
      error: 'Error detectando subtítulos embebidos',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}

function detectEmbeddedSubtitles(videoUrl: string): Promise<SubtitleStream[]> {
  return new Promise((resolve, reject) => {
    const ffprobePath = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
    
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams', 's', // Solo streams de subtítulos
      videoUrl
    ];

    logger.log('🎬 Ejecutando FFprobe:', ffprobePath, args.join(' '));

    const ffprobe = spawn(ffprobePath, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        logger.error('❌ FFprobe error:', stderr);
        reject(new Error(`FFprobe falló con código ${code}: ${stderr}`));
        return;
      }

      try {
        const result: FFProbeResponse = JSON.parse(stdout);
        const subtitleStreams = result.streams.filter(stream => 
          stream.codec_type === 'subtitle'
        );

        logger.log('📋 Subtítulos encontrados:', subtitleStreams.length);
        subtitleStreams.forEach((stream, index) => {
          logger.log(`  ${index + 1}. Codec: ${stream.codec_name}, Idioma: ${stream.tags?.language || 'N/A'}`);
        });

        resolve(subtitleStreams);
      } catch (parseError) {
        logger.error('❌ Error parseando respuesta FFprobe:', parseError);
        reject(new Error('Error parseando respuesta de FFprobe'));
      }
    });

    ffprobe.on('error', (error) => {
      logger.error('❌ Error ejecutando FFprobe:', error);
      reject(error);
    });
  });
}