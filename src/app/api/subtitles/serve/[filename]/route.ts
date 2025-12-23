import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { validateFilename } from '@/lib/input-validator';

// Función para convertir SRT a VTT
function convertSrtToVtt(srtContent: string): string {
  let vttContent = 'WEBVTT\n\n';
  
  // Reemplazar timestamps de SRT (00:00:00,000) a VTT (00:00:00.000)
  const vttTimestamps = srtContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  
  // Remover números de secuencia de SRT
  const lines = vttTimestamps.split('\n');
  let result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Saltar números de secuencia (líneas que solo contienen números)
    if (/^\d+$/.test(line)) {
      continue;
    }
    
    // Mantener timestamps y texto
    if (line.includes('-->') || line.length === 0 || line.length > 0) {
      result.push(line);
    }
  }
  
  vttContent += result.join('\n');
  return vttContent;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    
    // 🔒 VALIDAR FILENAME PARA PREVENIR PATH TRAVERSAL
    let safeFilename: string;
    try {
      safeFilename = validateFilename(filename);
    } catch (validationError) {
      logger.error('❌ Path traversal attempt detected:', filename);
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      );
    }
    
    // Directorio de subtítulos (guardados por opensubtitles-download)
    const subtitlesDir = path.join(process.cwd(), 'public', 'subtitles');
    const filePath = path.join(subtitlesDir, safeFilename);
    
    // 🔒 VERIFICAR QUE EL PATH RESUELTO ESTÉ DENTRO DEL DIRECTORIO PERMITIDO
    const realPath = fs.existsSync(filePath) ? fs.realpathSync(filePath) : filePath;
    const realSubtitlesDir = fs.realpathSync(subtitlesDir);
    
    if (!realPath.startsWith(realSubtitlesDir)) {
      logger.error('❌ Path traversal attempt blocked:', { filename, realPath });
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }
    
    logger.log(`📄 Sirviendo subtítulo: ${filename}`);
    
    // Verificar que el archivo existe
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Archivo de subtítulo no encontrado' },
        { status: 404 }
      );
    }
    
    // Leer el contenido del archivo
    let content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filename).toLowerCase();
    
    // Determinar Content-Type según extensión
    let contentType = 'text/plain; charset=utf-8';
    if (ext === '.vtt') {
      contentType = 'text/vtt; charset=utf-8';
      // Asegurar que comience con WEBVTT
      if (!content.startsWith('WEBVTT')) {
        content = 'WEBVTT\n\n' + content;
      }
    } else if (ext === '.srt') {
      // Servir SRT original sin convertir (mejor para ExoPlayer en Android TV)
      contentType = 'application/x-subrip; charset=utf-8';
      // No convertir, servir el SRT tal cual
    } else {
      // Para otros formatos, servir como texto plano
      contentType = 'text/plain; charset=utf-8';
    }
    
    // Headers CORS
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Content-Type': contentType
    };
    
    return new NextResponse(content, { headers });
    
  } catch (error) {
    logger.error('❌ Error sirviendo subtítulo:', error);
    return NextResponse.json(
      { 
        error: 'Error al servir subtítulo',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}