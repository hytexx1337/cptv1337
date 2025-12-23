// APIs adicionales para fuentes de torrents
import { logger } from '@/lib/logger';
import * as cheerio from 'cheerio';

export interface AdditionalTorrentStream {
  title: string;
  url: string;
  quality?: string;
  size?: string;
  seeds?: number;
  source: string;
  infoHash?: string;
}

// API de 1337x (usando Cheerio como en el script de prueba)
export const search1337x = async (query: string, season?: number, episode?: number): Promise<AdditionalTorrentStream[]> => {
  try {
    logger.log('🔍 Buscando en 1337x:', query);
    
    const encodedQuery = encodeURIComponent(query);
    const url = `https://1337x.to/category-search/${encodedQuery}/TV/1/`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      logger.warn('⚠️ Error en 1337x API:', response.status);
      return [];
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Buscar tabla de torrents usando Cheerio como en el script de prueba
    const torrentRows = $('table.table-list tbody tr');
    logger.log(`📊 Filas de torrents encontradas en 1337x: ${torrentRows.length}`);
    
    if (torrentRows.length === 0) {
      logger.log('❌ No se encontraron torrents en 1337x');
      return [];
    }
    
    const torrents: AdditionalTorrentStream[] = [];
    const torrentPromises: Promise<AdditionalTorrentStream | null>[] = [];
    
    // Procesar los primeros 5 torrents en paralelo
    for (let index = 0; index < Math.min(torrentRows.length, 5); index++) {
      const row = torrentRows[index];
      const $row = $(row);
      const nameCell = $row.find('.name');
      const titleLink = nameCell.find('a').eq(1);
      const title = titleLink.text().trim();
      const torrentUrl = titleLink.attr('href');
      // Extraer seeds y corregir duplicación de 1337x
      const seedsRaw = $row.find('.seeds').text().trim();
      let seeds = parseInt(seedsRaw) || 0;
      
      // 🔧 CORRECCIÓN: 1337x duplica los dígitos (ej: 63 se muestra como 6363)
      // Detectar si todos los dígitos están duplicados
      if (seedsRaw.length > 1 && seedsRaw.length % 2 === 0) {
        const half = seedsRaw.length / 2;
        const firstHalf = seedsRaw.substring(0, half);
        const secondHalf = seedsRaw.substring(half);
        
        if (firstHalf === secondHalf) {
          seeds = parseInt(firstHalf) || 0;
        }
      }
      const size = $row.find('.size').text().trim();
      
      if (title && torrentUrl) {
        // Filtrar por episodio específico si se proporciona
        if (season && episode) {
          const episodePattern = new RegExp(`S0?${season}E0?${episode}`, 'i');
          if (!episodePattern.test(title)) continue;
        }
        
        const torrentPromise = (async (): Promise<AdditionalTorrentStream | null> => {
          try {
            // Construir URL completa si es relativa
            const fullTorrentUrl = torrentUrl.startsWith('http') ? 
              torrentUrl : `https://1337x.to${torrentUrl}`;
            
            // 🔒 [FIX] Usar AbortController en lugar de AbortSignal.timeout (compatibilidad Node.js)
            const torrentController = new AbortController();
            const torrentTimeoutId = setTimeout(() => torrentController.abort(), 5000);
            
            const torrentResponse = await fetch(fullTorrentUrl, {
              signal: torrentController.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://1337x.to/'
              }
            }).finally(() => clearTimeout(torrentTimeoutId));
            
            if (torrentResponse.ok) {
              const torrentHtml = await torrentResponse.text();
              const $torrent = cheerio.load(torrentHtml);
              
              // Buscar enlace magnet en la página del torrent
              const magnetElement = $torrent('a[href^="magnet:"]');
              if (magnetElement.length > 0) {
                const magnetUrl = magnetElement.attr('href');
                return {
                  title,
                  url: magnetUrl || fullTorrentUrl,
                  quality: extractQualityFromTitle(title),
                  size,
                  seeds,
                  source: '1337x'
                };
              }
            }
            
            return null;
          } catch (error) {
            logger.error(`❌ Error obteniendo magnet para "${title}":`, error);
            return null;
          }
        })();
        
        torrentPromises.push(torrentPromise);
      }
    }
    
    // Ejecutar peticiones en paralelo
    const results = await Promise.all(torrentPromises);
    torrents.push(...results.filter((result): result is AdditionalTorrentStream => result !== null));
    
    logger.log(`📺 1337x: ${torrents.length} torrents encontrados`);
    return torrents;
    
  } catch (error) {
    logger.error('❌ Error buscando en 1337x:', error);
    return [];
  }
};

// API de ThePirateBay (usando proxy público)
export const searchThePirateBay = async (query: string, season?: number, episode?: number): Promise<AdditionalTorrentStream[]> => {
  try {
    logger.log('🔍 Buscando en ThePirateBay:', query);
    
    // Construir query específico para episodios
    let searchQuery = query;
    if (season && episode) {
      searchQuery = `${query} S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    // Usar API proxy pública de TPB
    const response = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(searchQuery)}&cat=0`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      logger.warn('⚠️ Error en ThePirateBay API:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      logger.log('📺 ThePirateBay: No se encontraron resultados');
      return [];
    }
    
    // Filtrar y mapear resultados
    const streams: AdditionalTorrentStream[] = data
      .filter(item => {
        if (!item.name || item.name === 'No results returned' || !item.info_hash) return false;
        
        // Filtrar por episodio específico si se proporciona
        if (season && episode) {
          const episodePatterns = [
            new RegExp(`S0?${season}E0?${episode}`, 'i'),
            new RegExp(`${season}x0?${episode}`, 'i'),
            new RegExp(`Season\\s*${season}.*Episode\\s*${episode}`, 'i')
          ];
          return episodePatterns.some(pattern => pattern.test(item.name));
        }
        
        return true;
      })
      .slice(0, 10) // Limitar a 10 resultados
      .map(item => ({
        title: item.name,
        url: `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(item.name)}&tr=udp://tracker.coppersurfer.tk:6969/announce&tr=udp://9.rarbg.to:2920/announce&tr=udp://tracker.opentrackr.org:1337`,
        quality: extractQualityFromTitle(item.name),
        size: formatBytes(parseInt(item.size)),
        seeds: parseInt(item.seeders) || 0,
        source: 'ThePirateBay',
        infoHash: item.info_hash
      }));
    
    logger.log(`📺 ThePirateBay: ${streams.length} torrents encontrados`);
    return streams;
    
  } catch (error) {
    logger.error('❌ Error buscando en ThePirateBay:', error);
    return [];
  }
};

// API de RARBG (usando Cheerio como en el script de prueba)
export const searchRARBG = async (query: string, season?: number, episode?: number): Promise<AdditionalTorrentStream[]> => {
  try {
    logger.log('🔍 Buscando en RARBG:', query);
    
    const encodedQuery = encodeURIComponent(query);
    const url = `https://rargb.to/search/?search=${encodedQuery}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      logger.log('📺 RARBG: No se pudo conectar al servicio');
      return [];
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Buscar tabla de torrents usando Cheerio como en el script de prueba
    const torrentRows = $('table.lista2t tr:not(:first-child)');
    logger.log(`📊 Filas de torrents encontradas en RARBG: ${torrentRows.length}`);
    
    if (torrentRows.length === 0) {
      logger.log('❌ No se encontraron torrents en RARBG');
      return [];
    }
    
    const torrents: AdditionalTorrentStream[] = [];
    const torrentPromises: Promise<AdditionalTorrentStream | null>[] = [];
    
    // Procesar los primeros 5 torrents en paralelo
    for (let index = 0; index < Math.min(torrentRows.length, 5); index++) {
      const row = torrentRows[index];
      const $row = $(row);
      
      // Extraer título del enlace
      const titleElement = $row.find('td:nth-child(2) a[title]');
      const title = titleElement.attr('title')?.trim();
      const torrentUrl = titleElement.attr('href');
      
      // Extraer seeds - RARBG tiene seeds en la columna 6
      const seedsText = $row.find('td:nth-child(6)').text().trim();
      const seeds = parseInt(seedsText) || 0;
      
      // Extraer tamaño - RARBG tiene el tamaño en la columna 3
      const size = $row.find('td:nth-child(3)').text().trim();
      
      if (title && torrentUrl) {
        // Filtrar por episodio específico si se proporciona
        if (season && episode) {
          const episodePattern = new RegExp(`S0?${season}E0?${episode}`, 'i');
          if (!episodePattern.test(title)) continue;
        }
        
        const torrentPromise = (async (): Promise<AdditionalTorrentStream | null> => {
          try {
            // Construir URL completa si es relativa
            const fullTorrentUrl = torrentUrl.startsWith('http') ? 
              torrentUrl : `https://rargb.to${torrentUrl}`;
            
            // 🔒 [FIX] Usar AbortController en lugar de AbortSignal.timeout (compatibilidad Node.js 18)
            const torrentController = new AbortController();
            const torrentTimeoutId = setTimeout(() => torrentController.abort(), 5000);
            
            const torrentResponse = await fetch(fullTorrentUrl, {
              signal: torrentController.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://rargb.to/'
              }
            }).finally(() => clearTimeout(torrentTimeoutId));
            
            if (torrentResponse.ok) {
              const torrentHtml = await torrentResponse.text();
              const $torrent = cheerio.load(torrentHtml);
              
              // Buscar enlace magnet en la página del torrent
              const magnetElement = $torrent('a[href^="magnet:"]');
              if (magnetElement.length > 0) {
                const magnetUrl = magnetElement.attr('href');
                return {
                  title,
                  url: magnetUrl || fullTorrentUrl,
                  quality: extractQualityFromTitle(title),
                  size,
                  seeds,
                  source: 'RARBG'
                };
              }
            }
            
            return null;
          } catch (error) {
            logger.error(`❌ Error obteniendo magnet para "${title}":`, error);
            return null;
          }
        })();
        
        torrentPromises.push(torrentPromise);
      }
    }
    
    // Ejecutar peticiones en paralelo
    const results = await Promise.all(torrentPromises);
    torrents.push(...results.filter((result): result is AdditionalTorrentStream => result !== null));
    
    logger.log(`📺 RARBG: ${torrents.length} torrents encontrados`);
    return torrents;
    
  } catch (error) {
    logger.error('❌ Error buscando en RARBG:', error);
    return [];
  }
};

// API de EZTV (usando web scraping con Cheerio)
export const searchEZTV = async (query: string, season?: number, episode?: number): Promise<AdditionalTorrentStream[]> => {
  try {
    logger.log('🔍 Buscando en EZTV:', query);
    
    const searchUrl = `https://eztvx.to/search/${encodeURIComponent(query.toLowerCase().replace(/\s+/g, '-'))}`;
    
    // Primero hacer una petición POST para activar "Show Links"
    logger.log('🔗 Activando "Show Links" en EZTV...');
    const formData = new URLSearchParams();
    formData.append('layout', 'def_wlinks');
    
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': searchUrl,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData
    });
    
    if (!response.ok) {
      logger.log(`❌ EZTV HTTP error: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Buscar filas de torrents
    const torrentRows = $('tr.forum_header_border');
    logger.log(`📊 EZTV rows found: ${torrentRows.length}`);
    
    if (torrentRows.length === 0) {
      logger.log('❌ No se encontraron torrents en EZTV');
      return [];
    }
    
    const torrents: AdditionalTorrentStream[] = [];
    
    torrentRows.each((index, row) => {
      const $row = $(row);
      
      try {
        // Extraer título
        let title = '';
        const titleSelectors = ['a.epinfo', '.epinfo', 'a[href*="/ep/"]', 'td:nth-child(2) a'];
        
        for (const selector of titleSelectors) {
          const element = $row.find(selector).first();
          if (element.length > 0) {
            title = element.text().trim();
            if (title && title.length > 5) break;
          }
        }
        
        // Extraer magnet link (ahora debería estar disponible después del POST)
        const magnetElement = $row.find('a[href^="magnet:"]');
        let magnetUrl = magnetElement.attr('href');
        
        if (magnetUrl) {
          magnetUrl = magnetUrl.replace(/&amp;/g, '&');
        }
        
        // Extraer tamaño
        const size = $row.find('td:nth-child(4)').text().trim() || 
                    $row.find('td').eq(3).text().trim();
        
        // Seeds (EZTV no siempre muestra seeds, usar 1 como default)
        const seedsText = $row.find('td:nth-child(6)').text().trim() || 
                         $row.find('td').eq(5).text().trim();
        const seeds = parseInt(seedsText) || 1;
        
        if (title && magnetUrl) {
          // Filtrar por episodio específico si se proporciona
          if (season && episode) {
            const episodePattern = new RegExp(`S0?${season}E0?${episode}`, 'i');
            if (!episodePattern.test(title)) return;
          }
          
          torrents.push({
            title,
            url: magnetUrl,
            quality: extractQualityFromTitle(title),
            size,
            seeds,
            source: 'EZTV'
          });
        }
      } catch (error) {
        logger.error('Error parseando torrent de EZTV:', error);
      }
    });
    
    logger.log(`✅ EZTV found ${torrents.length} torrents`);
    return torrents;
    
  } catch (error) {
    logger.log(`❌ EZTV search error: ${error}`);
    return [];
  }
};

// Utilidades auxiliares
const extractQualityFromTitle = (title: string): string => {
  const qualityMatch = title.match(/\b(2160p|1080p|720p|480p|360p|4K|UHD|HD|SD)\b/i);
  return qualityMatch ? qualityMatch[1].toUpperCase() : 'Unknown';
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Función para agregar todas las fuentes adicionales
export const searchAllAdditionalSources = async (
  query: string, 
  season?: number, 
  episode?: number
): Promise<AdditionalTorrentStream[]> => {
  logger.log('🔍 Buscando en fuentes adicionales:', query);
  
  const searchPromises = [
    search1337x(query, season, episode),
    searchThePirateBay(query, season, episode),
    searchRARBG(query, season, episode),
    searchEZTV(query, season, episode)
  ];
  
  try {
    const results = await Promise.allSettled(searchPromises);
    
    const allStreams: AdditionalTorrentStream[] = [];
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allStreams.push(...result.value);
      } else {
        const sources = ['1337x', 'ThePirateBay', 'RARBG', 'EZTV'];
        logger.warn(`⚠️ Error en ${sources[index]}:`, result.reason);
      }
    });
    
    // Ordenar por seeds (descendente) y calidad
    allStreams.sort((a, b) => {
      const seedsA = a.seeds || 0;
      const seedsB = b.seeds || 0;
      
      // Priorizar por seeds primero (más seeds = más "vivo")
      if (seedsA !== seedsB) {
        return seedsB - seedsA;
      }
      
      // Si tienen los mismos seeds, ordenar por calidad
      const qualityOrder = ['2160p', '4K', '1080p', '720p', '480p', '360p'];
      const qualityA = a.quality || 'Unknown';
      const qualityB = b.quality || 'Unknown';
      
      const indexA = qualityOrder.findIndex(q => qualityA.includes(q));
      const indexB = qualityOrder.findIndex(q => qualityB.includes(q));
      
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB; // Menor índice = mejor calidad
      }
      
      // Si no se puede determinar la calidad, mantener orden por seeds
      return 0;
    });
    
    logger.log('📺 Total streams adicionales encontrados:', allStreams.length);
    logger.log('🔥 Torrents ordenados por seeds (más vivos primero)');
    
    // Log de los primeros 3 torrents para debug
    if (allStreams.length > 0) {
      logger.log('🏆 Top 3 torrents más vivos:');
      allStreams.slice(0, 3).forEach((stream, index) => {
        logger.log(`${index + 1}. ${stream.title} - Seeds: ${stream.seeds || 0} - Fuente: ${stream.source}`);
      });
    }
    
    return allStreams;
    
  } catch (error) {
    logger.error('❌ Error en búsqueda de fuentes adicionales:', error);
    return [];
  }
};