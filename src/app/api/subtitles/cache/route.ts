import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Directorio de caché en el sistema de archivos
const CACHE_DIR = path.join(os.tmpdir(), 'subtitle-cache');

// Asegurar que existe el directorio de caché
async function ensureCacheDir() {
  try {
    await fs.access(CACHE_DIR);
  } catch {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    logger.log('📁 [CACHE] Directorio creado:', CACHE_DIR);
  }
}

// GET - Verificar si existe en caché y obtenerlo
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get('hash');
    const language = searchParams.get('language');

    if (!hash || !language) {
      return NextResponse.json(
        { error: 'hash y language son requeridos' },
        { status: 400 }
      );
    }

    await ensureCacheDir();

    // Nombre del archivo en caché
    const cacheKey = `${hash}_${language}.vtt`;
    const cachePath = path.join(CACHE_DIR, cacheKey);

    try {
      // Verificar si existe
      await fs.access(cachePath);
      
      // Leer contenido
      const content = await fs.readFile(cachePath, 'utf-8');
      
      logger.log(`✅ [CACHE] Hit: ${cacheKey}`);
      
      return NextResponse.json({
        cached: true,
        content,
        cacheKey,
      });
    } catch {
      logger.log(`❌ [CACHE] Miss: ${cacheKey}`);
      return NextResponse.json({ cached: false });
    }
  } catch (error) {
    logger.error('❌ [CACHE] Error verificando caché:', error);
    return NextResponse.json(
      { error: 'Error verificando caché' },
      { status: 500 }
    );
  }
}

// POST - Guardar en caché
export async function POST(request: NextRequest) {
  try {
    const { hash, language, content } = await request.json();

    if (!hash || !language || !content) {
      return NextResponse.json(
        { error: 'hash, language y content son requeridos' },
        { status: 400 }
      );
    }

    await ensureCacheDir();

    // Nombre del archivo en caché
    const cacheKey = `${hash}_${language}.vtt`;
    const cachePath = path.join(CACHE_DIR, cacheKey);

    // Guardar contenido
    await fs.writeFile(cachePath, content, 'utf-8');

    logger.log(`💾 [CACHE] Guardado: ${cacheKey} (${content.length} bytes)`);

    return NextResponse.json({
      success: true,
      cacheKey,
      size: content.length,
    });
  } catch (error) {
    logger.error('❌ [CACHE] Error guardando en caché:', error);
    return NextResponse.json(
      { error: 'Error guardando en caché' },
      { status: 500 }
    );
  }
}

// DELETE - Limpiar caché (útil para mantenimiento)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deleteAll = searchParams.get('all') === 'true';

    await ensureCacheDir();

    if (deleteAll) {
      // Eliminar todos los archivos del caché
      const files = await fs.readdir(CACHE_DIR);
      let deleted = 0;

      for (const file of files) {
        if (file.endsWith('.vtt')) {
          await fs.unlink(path.join(CACHE_DIR, file));
          deleted++;
        }
      }

      logger.log(`🗑️ [CACHE] Eliminados ${deleted} archivos`);

      return NextResponse.json({
        success: true,
        deleted,
        message: `${deleted} archivos eliminados del caché`,
      });
    }

    return NextResponse.json({ success: false, message: 'No se especificó qué eliminar' });
  } catch (error) {
    logger.error('❌ [CACHE] Error limpiando caché:', error);
    return NextResponse.json(
      { error: 'Error limpiando caché' },
      { status: 500 }
    );
  }
}

