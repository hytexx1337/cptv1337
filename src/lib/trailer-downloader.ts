/**
 * Servicio para descargar y cachear trailers de IMDb localmente
 */

import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';

// Tipos
export interface TrailerCacheEntry {
  imdbId: string;
  filename: string;
  filepath: string;
  url: string;
  downloadedAt: number; // timestamp
  fileSize: number; // bytes
  duration?: number;
  title?: string;
  format: 'mp4' | 'm3u8';
  expiresAt?: number | null; // timestamp para URLs que expiran
}

export interface TrailerCacheDB {
  version: string;
  lastUpdated: number;
  trailers: Record<string, TrailerCacheEntry>; // key = imdbId
}

// Configuración
const TRAILERS_DIR = path.join(process.cwd(), 'public', 'trailers');
const CACHE_DB_PATH = path.join(process.cwd(), 'data', 'trailer-cache.json');
const MAX_CACHE_AGE_DAYS = 365; // Los trailers son permanentes, pero podemos limpiar viejos
const MAX_CACHE_SIZE_GB = 10; // Límite de tamaño total

/**
 * Asegura que existan los directorios necesarios
 */
async function ensureDirectories() {
  await fs.mkdir(TRAILERS_DIR, { recursive: true });
  await fs.mkdir(path.dirname(CACHE_DB_PATH), { recursive: true });
}

/**
 * Lee la base de datos de cache
 */
export async function readCacheDB(): Promise<TrailerCacheDB> {
  try {
    const data = await fs.readFile(CACHE_DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Crear nueva DB
      const newDB: TrailerCacheDB = {
        version: '1.0.0',
        lastUpdated: Date.now(),
        trailers: {}
      };
      await ensureDirectories();
      await fs.writeFile(CACHE_DB_PATH, JSON.stringify(newDB, null, 2));
      return newDB;
    }
    throw error;
  }
}

/**
 * Guarda la base de datos de cache
 */
async function saveCacheDB(db: TrailerCacheDB): Promise<void> {
  db.lastUpdated = Date.now();
  await ensureDirectories();
  await fs.writeFile(CACHE_DB_PATH, JSON.stringify(db, null, 2));
}

/**
 * Verifica si un trailer está en cache y es válido
 */
export async function getTrailerFromCache(imdbId: string): Promise<TrailerCacheEntry | null> {
  const db = await readCacheDB();
  const entry = db.trailers[imdbId];
  
  if (!entry) {
    return null;
  }
  
  // Verificar que el archivo existe
  try {
    await fs.access(path.join(process.cwd(), 'public', 'trailers', entry.filename));
    
    // Verificar si la URL ha expirado (solo para m3u8 que suelen tener expiración)
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      console.log(`⚠️ [TrailerCache] Entrada expirada para ${imdbId}, necesita refresco`);
      return null;
    }
    
    return entry;
  } catch {
    // El archivo no existe, limpiar la entrada
    console.log(`⚠️ [TrailerCache] Archivo no encontrado para ${imdbId}, limpiando entrada`);
    delete db.trailers[imdbId];
    await saveCacheDB(db);
    return null;
  }
}

/**
 * Descarga un trailer y lo guarda en cache
 */
export async function downloadAndCacheTrailer(
  imdbId: string,
  streamUrl: string,
  options: {
    format: 'mp4' | 'm3u8';
    title?: string;
    duration?: number;
    headers?: Record<string, string>;
    cookieHeader?: string | null;
    expiresEpoch?: number | null;
  }
): Promise<TrailerCacheEntry> {
  await ensureDirectories();
  
  console.log(`📥 [TrailerCache] Descargando trailer para ${imdbId}...`);
  
  // Generar nombre de archivo único
  const ext = options.format === 'mp4' ? 'mp4' : 'm3u8';
  const filename = `${imdbId}_${Date.now()}.${ext}`;
  const filepath = path.join(TRAILERS_DIR, filename);
  
  // Preparar headers para la descarga
  const downloadHeaders: Record<string, string> = {
    'User-Agent': options.headers?.['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ...options.headers
  };
  
  if (options.cookieHeader) {
    downloadHeaders['Cookie'] = options.cookieHeader;
  }
  
  try {
    // Descargar el archivo
    const response = await axios.get(streamUrl, {
      headers: downloadHeaders,
      responseType: 'arraybuffer',
      timeout: 120000, // 2 minutos timeout
      maxRedirects: 5
    });
    
    // Guardar el archivo
    await fs.writeFile(filepath, response.data);
    
    const fileSize = response.data.byteLength;
    console.log(`✅ [TrailerCache] Descargado ${filename} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    
    // Crear entrada en cache
    const entry: TrailerCacheEntry = {
      imdbId,
      filename,
      filepath: `/trailers/${filename}`,
      url: streamUrl,
      downloadedAt: Date.now(),
      fileSize,
      format: options.format,
      title: options.title,
      duration: options.duration,
      expiresAt: options.expiresEpoch ? options.expiresEpoch * 1000 : null
    };
    
    // Actualizar la DB
    const db = await readCacheDB();
    
    // Si ya existía una entrada antigua, eliminar el archivo viejo
    if (db.trailers[imdbId]) {
      const oldEntry = db.trailers[imdbId];
      try {
        await fs.unlink(path.join(process.cwd(), 'public', 'trailers', oldEntry.filename));
        console.log(`🗑️ [TrailerCache] Eliminado archivo antiguo: ${oldEntry.filename}`);
      } catch (err) {
        console.log(`⚠️ [TrailerCache] No se pudo eliminar archivo antiguo: ${err}`);
      }
    }
    
    db.trailers[imdbId] = entry;
    await saveCacheDB(db);
    
    // Verificar el tamaño total del cache
    await cleanupCacheIfNeeded();
    
    return entry;
    
  } catch (error: any) {
    console.error(`❌ [TrailerCache] Error descargando trailer:`, error.message);
    
    // Intentar limpiar archivo parcial
    try {
      await fs.unlink(filepath);
    } catch {}
    
    throw new Error(`No se pudo descargar el trailer: ${error.message}`);
  }
}

/**
 * Limpia el cache si supera los límites configurados
 */
async function cleanupCacheIfNeeded(): Promise<void> {
  const db = await readCacheDB();
  const entries = Object.values(db.trailers);
  
  // Calcular tamaño total
  const totalSize = entries.reduce((sum, e) => sum + e.fileSize, 0);
  const totalSizeGB = totalSize / 1024 / 1024 / 1024;
  
  console.log(`📊 [TrailerCache] Tamaño total: ${totalSizeGB.toFixed(2)} GB (${entries.length} trailers)`);
  
  if (totalSizeGB <= MAX_CACHE_SIZE_GB) {
    return;
  }
  
  console.log(`⚠️ [TrailerCache] Cache excede ${MAX_CACHE_SIZE_GB} GB, limpiando entradas antiguas...`);
  
  // Ordenar por fecha de descarga (más antiguo primero)
  const sorted = entries.sort((a, b) => a.downloadedAt - b.downloadedAt);
  
  let deletedSize = 0;
  let deletedCount = 0;
  
  // Eliminar hasta estar bajo el límite
  for (const entry of sorted) {
    if (totalSizeGB - (deletedSize / 1024 / 1024 / 1024) <= MAX_CACHE_SIZE_GB * 0.8) {
      break; // Dejar un margen del 20%
    }
    
    try {
      await fs.unlink(path.join(process.cwd(), 'public', 'trailers', entry.filename));
      delete db.trailers[entry.imdbId];
      deletedSize += entry.fileSize;
      deletedCount++;
      console.log(`🗑️ [TrailerCache] Eliminado: ${entry.filename}`);
    } catch (err) {
      console.log(`⚠️ [TrailerCache] Error eliminando ${entry.filename}:`, err);
    }
  }
  
  await saveCacheDB(db);
  console.log(`✅ [TrailerCache] Limpieza completada: ${deletedCount} archivos, ${(deletedSize / 1024 / 1024).toFixed(2)} MB liberados`);
}

/**
 * Elimina un trailer específico del cache
 */
export async function deleteTrailerFromCache(imdbId: string): Promise<boolean> {
  const db = await readCacheDB();
  const entry = db.trailers[imdbId];
  
  if (!entry) {
    return false;
  }
  
  try {
    await fs.unlink(path.join(process.cwd(), 'public', 'trailers', entry.filename));
    delete db.trailers[imdbId];
    await saveCacheDB(db);
    console.log(`🗑️ [TrailerCache] Eliminado trailer: ${imdbId}`);
    return true;
  } catch (error) {
    console.error(`❌ [TrailerCache] Error eliminando trailer:`, error);
    return false;
  }
}

/**
 * Obtiene estadísticas del cache
 */
export async function getCacheStats() {
  const db = await readCacheDB();
  const entries = Object.values(db.trailers);
  
  const totalSize = entries.reduce((sum, e) => sum + e.fileSize, 0);
  const mp4Count = entries.filter(e => e.format === 'mp4').length;
  const m3u8Count = entries.filter(e => e.format === 'm3u8').length;
  
  return {
    totalTrailers: entries.length,
    totalSizeMB: totalSize / 1024 / 1024,
    totalSizeGB: totalSize / 1024 / 1024 / 1024,
    mp4Count,
    m3u8Count,
    oldestTrailer: entries.length > 0 ? Math.min(...entries.map(e => e.downloadedAt)) : null,
    newestTrailer: entries.length > 0 ? Math.max(...entries.map(e => e.downloadedAt)) : null,
    maxCacheSizeGB: MAX_CACHE_SIZE_GB
  };
}

/**
 * Lista todos los trailers en cache
 */
export async function listCachedTrailers() {
  const db = await readCacheDB();
  return Object.values(db.trailers);
}

