import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { validateUrl, validateInteger, sanitizeForCommand } from '@/lib/input-validator';

export async function POST(request: NextRequest) {
  try {
    const { videoUrl, streamIndex = 0, language = 'es' } = await request.json();
    
    if (!videoUrl) {
      return NextResponse.json({ error: 'URL del video requerida' }, { status: 400 });
    }

    // 🔒 VALIDAR INPUT PARA PREVENIR COMMAND INJECTION
    try {
      validateUrl(videoUrl, true); // Permitir URLs privadas (streaming interno)
      sanitizeForCommand(videoUrl); // Verificar caracteres peligrosos
      validateInteger(streamIndex, 0, 100); // Validar streamIndex
    } catch (validationError) {
      logger.error('❌ Validación de input falló:', validationError);
      return NextResponse.json({ 
        error: 'Input inválido',
        details: validationError instanceof Error ? validationError.message : 'Validación falló'
      }, { status: 400 });
    }

    logger.log('📥 Extrayendo subtítulos SRT del stream:', streamIndex);

    // Crear directorio temporal si no existe
    const tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generar nombres de archivos únicos
    const timestamp = Date.now();
    const srtFile = path.join(tempDir, `subtitles_${timestamp}.srt`);
    const vttFile = path.join(tempDir, `subtitles_${timestamp}.vtt`);

    try {
      // Paso 1: Extraer subtítulos SRT
      await extractSubtitles(videoUrl, streamIndex, srtFile);
      
      // Paso 2: Convertir SRT a WebVTT
      await convertSrtToVtt(srtFile, vttFile);
      
      // Paso 3: Leer el archivo VTT generado
      const vttContent = fs.readFileSync(vttFile, 'utf8');
      
      // Limpiar archivos temporales
      if (fs.existsSync(srtFile)) fs.unlinkSync(srtFile);
      if (fs.existsSync(vttFile)) fs.unlinkSync(vttFile);
      
      return NextResponse.json({
        success: true,
        vttContent,
        language,
        message: 'Subtítulos extraídos y convertidos exitosamente'
      });

    } catch (extractError) {
      // Limpiar archivos en caso de error
      if (fs.existsSync(srtFile)) fs.unlinkSync(srtFile);
      if (fs.existsSync(vttFile)) fs.unlinkSync(vttFile);
      throw extractError;
    }

  } catch (error) {
    logger.error('❌ Error extrayendo subtítulos:', error);
    return NextResponse.json({ 
      error: 'Error extrayendo subtítulos',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}

function extractSubtitles(videoUrl: string, streamIndex: number, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    
    const args = [
      '-i', videoUrl,
      '-map', `0:s:${streamIndex}`, // Mapear stream de subtítulos específico
      '-c', 'copy', // Copiar sin recodificar
      '-y', // Sobrescribir archivo si existe
      outputFile
    ];

    logger.log('🎬 Extrayendo con FFmpeg:', ffmpegPath, args.join(' '));

    const ffmpeg = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        logger.error('❌ FFmpeg extraction error:', stderr);
        reject(new Error(`FFmpeg falló extrayendo subtítulos: ${stderr}`));
        return;
      }

      logger.log('✅ Subtítulos SRT extraídos exitosamente');
      resolve();
    });

    ffmpeg.on('error', (error) => {
      logger.error('❌ Error ejecutando FFmpeg:', error);
      reject(error);
    });
  });
}

function convertSrtToVtt(srtFile: string, vttFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    
    const args = [
      '-i', srtFile,
      '-c:s', 'webvtt', // Convertir a WebVTT
      '-y', // Sobrescribir archivo si existe
      vttFile
    ];

    logger.log('🔄 Convirtiendo SRT a VTT:', ffmpegPath, args.join(' '));

    const ffmpeg = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        logger.error('❌ FFmpeg conversion error:', stderr);
        reject(new Error(`FFmpeg falló convirtiendo a VTT: ${stderr}`));
        return;
      }

      logger.log('✅ Conversión SRT → VTT exitosa');
      resolve();
    });

    ffmpeg.on('error', (error) => {
      logger.error('❌ Error ejecutando FFmpeg conversion:', error);
      reject(error);
    });
  });
}