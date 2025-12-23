import { promises as fs } from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'm3u8');
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 días (los m3u8 de 111movies son permanentes)

interface Subtitle {
  url: string;
  language: string;
  label: string;
}

interface CacheEntry {
  streamUrl: string;
  sourceUrl: string;
  type: string;
  id: string;
  season?: string;
  episode?: string;
  subtitles?: Subtitle[]; // Subtítulos asociados al stream
  timestamp: number;
  expiresAt: number;
}

/**
 * Genera una clave única para el cache basada en los parámetros
 */
function getCacheKey(type: string, id: string, season?: string, episode?: string): string {
  // Detectar si es TV (puede ser 'tv' o 'vidking-tv', etc.)
  const isTv = type.includes('tv');
  
  if (isTv && season && episode) {
    return `${type}_${id}_s${season}e${episode}`;
  }
  return `${type}_${id}`;
}

/**
 * Obtiene la ruta del archivo de cache
 */
function getCachePath(cacheKey: string): string {
  return path.join(CACHE_DIR, `${cacheKey}.json`);
}

/**
 * Inicializa el directorio de cache
 */
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('❌ Error creando directorio de cache:', error);
  }
}

/**
 * Verifica si un m3u8 sigue siendo válido haciendo un HEAD request
 */
async function isM3u8Valid(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3 segundos timeout

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch (error) {
    console.log(`⚠️ [CACHE] m3u8 no válido o expirado: ${url.substring(0, 60)}...`);
    return false;
  }
}

/**
 * Guarda un m3u8 en el cache
 */
export async function saveM3u8Cache(
  type: string,
  id: string,
  streamUrl: string,
  sourceUrl: string,
  season?: string,
  episode?: string,
  ttlMs: number = CACHE_TTL_MS,
  subtitles?: Subtitle[]
): Promise<void> {
  try {
    await ensureCacheDir();

    const cacheKey = getCacheKey(type, id, season, episode);
    const cachePath = getCachePath(cacheKey);
    const now = Date.now();

    const entry: CacheEntry = {
      streamUrl,
      sourceUrl,
      type,
      id,
      season,
      episode,
      subtitles, // Guardar subtítulos en el caché
      timestamp: now,
      expiresAt: now + ttlMs,
    };

    await fs.writeFile(cachePath, JSON.stringify(entry, null, 2), 'utf-8');
    console.log(`✅ [CACHE] m3u8 guardado: ${cacheKey} (expira en ${(ttlMs / 1000 / 60 / 60 / 24).toFixed(0)} días)`);
  } catch (error) {
    console.error('❌ [CACHE] Error guardando m3u8:', error);
  }
}

/**
 * Obtiene un m3u8 del cache si existe y no ha expirado
 */
export async function getM3u8Cache(
  type: string,
  id: string,
  season?: string,
  episode?: string,
  validateUrl: boolean = false // ⚡ Deshabilitado por defecto (los m3u8 de 111movies son permanentes)
): Promise<CacheEntry | null> {
  try {
    const cacheKey = getCacheKey(type, id, season, episode);
    const cachePath = getCachePath(cacheKey);

    // Verificar si el archivo existe
    try {
      await fs.access(cachePath);
    } catch {
      console.log(`ℹ️ [CACHE] No existe cache para: ${cacheKey}`);
      return null;
    }

    // Leer el archivo
    const content = await fs.readFile(cachePath, 'utf-8');
    const entry: CacheEntry = JSON.parse(content);

    // Verificar si ha expirado (90 días)
    const now = Date.now();
    if (now > entry.expiresAt) {
      const ageDays = ((now - entry.timestamp) / 1000 / 60 / 60 / 24).toFixed(1);
      console.log(`⏰ [CACHE] Cache expirado para: ${cacheKey} (edad: ${ageDays} días)`);
      await fs.unlink(cachePath).catch(() => {}); // Eliminar cache expirado
      return null;
    }

    // Verificar si el m3u8 sigue siendo válido (solo si se solicita explícitamente)
    if (validateUrl) {
      const isValid = await isM3u8Valid(entry.streamUrl);
      if (!isValid) {
        console.log(`❌ [CACHE] m3u8 no válido para: ${cacheKey}`);
        await fs.unlink(cachePath).catch(() => {}); // Eliminar cache inválido
        return null;
      }
    }

    const ageDays = ((now - entry.timestamp) / 1000 / 60 / 60 / 24).toFixed(1);
    console.log(`✅ [CACHE-HIT] Cache encontrado: ${cacheKey} (edad: ${ageDays} días, expira en ${((entry.expiresAt - now) / 1000 / 60 / 60 / 24).toFixed(1)} días)`);
    return entry;
  } catch (error) {
    console.error('❌ [CACHE] Error leyendo cache:', error);
    return null;
  }
}

/**
 * Limpia el cache de entradas expiradas
 */
export async function cleanExpiredCache(): Promise<void> {
  try {
    await ensureCacheDir();
    const files = await fs.readdir(CACHE_DIR);
    const now = Date.now();
    let cleaned = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(CACHE_DIR, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const entry: CacheEntry = JSON.parse(content);

        if (now > entry.expiresAt) {
          await fs.unlink(filePath);
          cleaned++;
        }
      } catch (error) {
        // Si hay error leyendo el archivo, eliminarlo
        await fs.unlink(filePath).catch(() => {});
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [CACHE] ${cleaned} entrada(s) expirada(s) eliminada(s)`);
    }
  } catch (error) {
    console.error('❌ [CACHE] Error limpiando cache:', error);
  }
}

/**
 * Elimina todo el cache
 */
export async function clearAllCache(): Promise<void> {
  try {
    await fs.rm(CACHE_DIR, { recursive: true, force: true });
    console.log('🧹 [CACHE] Todo el cache eliminado');
  } catch (error) {
    console.error('❌ [CACHE] Error eliminando cache:', error);
  }
}

/**
 * Obtiene estadísticas del cache
 */
export async function getCacheStats(): Promise<{
  total: number;
  valid: number;
  expired: number;
  totalSizeMB: number;
}> {
  try {
    await ensureCacheDir();
    const files = await fs.readdir(CACHE_DIR);
    const now = Date.now();
    let total = 0;
    let valid = 0;
    let expired = 0;
    let totalSize = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(CACHE_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
        total++;

        const content = await fs.readFile(filePath, 'utf-8');
        const entry: CacheEntry = JSON.parse(content);

        if (now > entry.expiresAt) {
          expired++;
        } else {
          valid++;
        }
      } catch {}
    }

    return {
      total,
      valid,
      expired,
      totalSizeMB: totalSize / 1024 / 1024,
    };
  } catch (error) {
    return { total: 0, valid: 0, expired: 0, totalSizeMB: 0 };
  }
}

