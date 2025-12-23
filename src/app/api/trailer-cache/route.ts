/**
 * API para gestionar el cache de trailers
 * 
 * GET /api/trailer-cache?action=stats     - Obtener estadísticas
 * GET /api/trailer-cache?action=list      - Listar todos los trailers
 * DELETE /api/trailer-cache?imdbId=ttXXX  - Eliminar un trailer específico
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCacheStats,
  listCachedTrailers,
  deleteTrailerFromCache,
  readCacheDB
} from '@/lib/trailer-downloader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET - Obtener información del cache
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'stats';
  const imdbId = searchParams.get('imdbId');

  try {
    switch (action) {
      case 'stats': {
        const stats = await getCacheStats();
        return NextResponse.json({
          success: true,
          stats
        });
      }

      case 'list': {
        const trailers = await listCachedTrailers();
        return NextResponse.json({
          success: true,
          trailers,
          count: trailers.length
        });
      }

      case 'get': {
        if (!imdbId) {
          return NextResponse.json(
            { success: false, error: 'imdbId requerido' },
            { status: 400 }
          );
        }

        const db = await readCacheDB();
        const trailer = db.trailers[imdbId];

        if (!trailer) {
          return NextResponse.json(
            { success: false, error: 'Trailer no encontrado en cache' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          trailer
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Acción no válida' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('❌ [TrailerCache API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Eliminar trailer(s) del cache
 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imdbId = searchParams.get('imdbId');
  const all = searchParams.get('all') === 'true';

  try {
    if (all) {
      // Eliminar todos los trailers
      const trailers = await listCachedTrailers();
      let deleted = 0;
      let failed = 0;

      for (const trailer of trailers) {
        const success = await deleteTrailerFromCache(trailer.imdbId);
        if (success) {
          deleted++;
        } else {
          failed++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Eliminados ${deleted} trailers (${failed} fallos)`,
        deleted,
        failed
      });
    }

    if (!imdbId) {
      return NextResponse.json(
        { success: false, error: 'imdbId requerido o use all=true' },
        { status: 400 }
      );
    }

    const success = await deleteTrailerFromCache(imdbId);

    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Trailer no encontrado o error al eliminar' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Trailer ${imdbId} eliminado del cache`
    });
  } catch (error: any) {
    console.error('❌ [TrailerCache API] Error eliminando:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST - Operaciones especiales
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;

    switch (action) {
      case 'cleanup': {
        // Forzar limpieza del cache
        const stats = await getCacheStats();
        
        return NextResponse.json({
          success: true,
          message: 'Limpieza de cache completada',
          stats
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Acción no válida' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('❌ [TrailerCache API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

