import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const CACHE_DIR = path.join(os.tmpdir(), 'subtitle-cache');
const MAX_AGE_DAYS = 7; // Eliminar archivos mayores a 7 días

export async function POST() {
  try {
    // Verificar que existe el directorio
    try {
      await fs.access(CACHE_DIR);
    } catch {
      return NextResponse.json({
        success: true,
        message: 'No existe directorio de caché',
        deleted: 0,
      });
    }

    const files = await fs.readdir(CACHE_DIR);
    let deleted = 0;
    let totalSize = 0;
    const now = Date.now();
    const maxAge = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (!file.endsWith('.vtt')) continue;

      const filePath = path.join(CACHE_DIR, file);
      const stats = await fs.stat(filePath);

      // Si el archivo es más viejo que MAX_AGE_DAYS, eliminar
      const age = now - stats.mtimeMs;
      if (age > maxAge) {
        await fs.unlink(filePath);
        deleted++;
        totalSize += stats.size;
      }
    }

    logger.log(`🧹 [CACHE-CLEANUP] Eliminados ${deleted} archivos (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);

    return NextResponse.json({
      success: true,
      deleted,
      sizeFreed: totalSize,
      message: `Limpieza completada: ${deleted} archivos eliminados (${(totalSize / 1024 / 1024).toFixed(2)} MB liberados)`,
    });
  } catch (error) {
    logger.error('❌ [CACHE-CLEANUP] Error:', error);
    return NextResponse.json(
      { error: 'Error durante limpieza de caché' },
      { status: 500 }
    );
  }
}

// GET para ver estadísticas del caché
export async function GET() {
  try {
    try {
      await fs.access(CACHE_DIR);
    } catch {
      return NextResponse.json({
        exists: false,
        message: 'No existe directorio de caché',
      });
    }

    const files = await fs.readdir(CACHE_DIR);
    let totalFiles = 0;
    let totalSize = 0;
    const languages: Record<string, number> = {};

    for (const file of files) {
      if (!file.endsWith('.vtt')) continue;

      const filePath = path.join(CACHE_DIR, file);
      const stats = await fs.stat(filePath);

      totalFiles++;
      totalSize += stats.size;

      // Extraer idioma del nombre del archivo (hash_LANG.vtt)
      const match = file.match(/_([a-z]{2})\.vtt$/);
      if (match) {
        const lang = match[1];
        languages[lang] = (languages[lang] || 0) + 1;
      }
    }

    return NextResponse.json({
      exists: true,
      totalFiles,
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      languages,
      cacheDir: CACHE_DIR,
    });
  } catch (error) {
    logger.error('❌ [CACHE-STATS] Error:', error);
    return NextResponse.json(
      { error: 'Error obteniendo estadísticas' },
      { status: 500 }
    );
  }
}

