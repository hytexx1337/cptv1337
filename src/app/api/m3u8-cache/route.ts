import { NextRequest, NextResponse } from 'next/server';
import { getCacheStats, cleanExpiredCache, clearAllCache } from '@/lib/m3u8-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/m3u8-cache - Obtiene estadísticas del cache
 * GET /api/m3u8-cache?action=clean - Limpia cache expirado
 * GET /api/m3u8-cache?action=clear - Elimina todo el cache
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    if (action === 'clean') {
      await cleanExpiredCache();
      const stats = await getCacheStats();
      return NextResponse.json({
        message: 'Cache expirado limpiado',
        stats,
      });
    }

    if (action === 'clear') {
      await clearAllCache();
      return NextResponse.json({
        message: 'Todo el cache eliminado',
        stats: { total: 0, valid: 0, expired: 0, totalSizeMB: 0 },
      });
    }

    // Por defecto, retornar estadísticas
    const stats = await getCacheStats();
    return NextResponse.json({
      stats,
      message: `Cache: ${stats.valid} válido(s), ${stats.expired} expirado(s), ${stats.totalSizeMB.toFixed(2)} MB`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error gestionando cache', message: error?.message },
      { status: 500 }
    );
  }
}

