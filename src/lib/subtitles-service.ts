import { logger } from '@/lib/logger';
interface SubtitleFile {
  id: string;
  language: string;
  languageName: string;
  url: string;
  filename: string;
  downloads: number;
  encoding: string;
  movieHash?: string;
  movieByteSize?: number;
}

interface OpenSubtitlesResponse {
  total_pages: number;
  total_count: number;
  per_page: number;
  page: number;
  data: Array<{
    id: string;
    type: string;
    attributes: {
      subtitle_id: string;
      language: string;
      download_count: number;
      new_download_count: number;
      hearing_impaired: boolean;
      hd: boolean;
      fps: number;
      votes: number;
      points: number;
      ratings: number;
      from_trusted: boolean;
      foreign_parts_only: boolean;
      ai_translated: boolean;
      machine_translated: boolean;
      upload_date: string;
      release: string;
      comments: string;
      legacy_subtitle_id: number;
      uploader: {
        uploader_id: number;
        name: string;
        rank: string;
      };
      feature_details: {
        feature_id: number;
        feature_type: string;
        year: number;
        title: string;
        movie_name: string;
        imdb_id: number;
        tmdb_id: number;
      };
      url: string;
      related_links: {
        label: string;
        url: string;
        img_url: string;
      }[];
      files: Array<{
        file_id: number;
        cd_number: number;
        file_name: string;
      }>;
    };
  }>;
}

class SubtitlesService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.opensubtitles.com/api/v1';
  private readonly userAgent = 'TorrentStreamer v1.0';
  
  // Cache para búsquedas de subtítulos (5 minutos de duración)
  private searchCache = new Map<string, { data: SubtitleFile[]; timestamp: number }>();
  // Cache para descargas de subtítulos (10 minutos de duración)
  private downloadCache = new Map<string, { data: string; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
  private readonly DOWNLOAD_CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Calcula el moviehash de OpenSubtitles para un archivo
   * Este algoritmo lee los primeros y últimos 64KB del archivo
   */
  async calculateMovieHash(file: File): Promise<{ hash: string; byteSize: number }> {
    const chunkSize = 64 * 1024; // 64KB
    const fileSize = file.size;
    
    if (fileSize < chunkSize) {
      throw new Error('File too small to calculate hash');
    }

    // Leer los primeros 64KB
    const headChunk = await this.readFileChunk(file, 0, chunkSize);
    // Leer los últimos 64KB
    const tailChunk = await this.readFileChunk(file, fileSize - chunkSize, chunkSize);

    // Calcular checksums
    const headChecksum = this.calculateChecksum(headChunk);
    const tailChecksum = this.calculateChecksum(tailChunk);

    // El hash final es: tamaño del archivo + checksum head + checksum tail
    const hash = this.combineChecksums(fileSize, headChecksum, tailChecksum);

    return {
      hash: hash.toString(16).padStart(16, '0'),
      byteSize: fileSize
    };
  }

  private async readFileChunk(file: File, start: number, length: number): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file.slice(start, start + length));
    });
  }

  private calculateChecksum(buffer: ArrayBuffer): bigint {
    const view = new DataView(buffer);
    let checksum = BigInt(0);
    
    // Procesar en chunks de 8 bytes (64 bits)
    for (let i = 0; i < buffer.byteLength; i += 8) {
      if (i + 8 <= buffer.byteLength) {
        // Leer 8 bytes como little-endian
        const low = BigInt(view.getUint32(i, true));
        const high = BigInt(view.getUint32(i + 4, true));
        const value = (high << BigInt(32)) | low;
        checksum += value;
      } else {
        // Manejar bytes restantes
        for (let j = i; j < buffer.byteLength; j++) {
          checksum += BigInt(view.getUint8(j)) << BigInt((j - i) * 8);
        }
      }
    }
    
    return checksum & BigInt('0xFFFFFFFFFFFFFFFF'); // Mantener 64 bits
  }

  private combineChecksums(fileSize: number, headChecksum: bigint, tailChecksum: bigint): bigint {
    return (BigInt(fileSize) + headChecksum + tailChecksum) & BigInt('0xFFFFFFFFFFFFFFFF');
  }

  /**
   * Busca subtítulos usando diferentes métodos
   */
  async searchSubtitles(params: {
    movieHash?: string;
    byteSize?: number;
    imdbId?: string;
    tmdbId?: string | number;
    query?: string;
    languages?: string[];
    season?: number;
    episode?: number;
  }): Promise<SubtitleFile[]> {
    // Crear clave de cache basada en los parámetros
    const cacheKey = JSON.stringify(params);
    
    // Verificar cache
    const cached = this.searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
      logger.log('Subtitles cache hit:', cacheKey);
      return cached.data;
    }

    const searchParams = new URLSearchParams();

    // MEJOR: Enviar TODOS los parámetros disponibles juntos para maximizar resultados
    // OpenSubtitles combinará los criterios inteligentemente
    if (params.movieHash) {
      searchParams.append('moviehash', params.movieHash);
      if (params.byteSize) {
        searchParams.append('moviebytesize', params.byteSize.toString());
      }
      logger.log('🔍 [SEARCH] Usando moviehash:', params.movieHash);
    }
    
    if (params.imdbId) {
      searchParams.append('imdb_id', params.imdbId);
      logger.log('🔍 [SEARCH] Usando IMDb ID:', params.imdbId);
    } else if (params.tmdbId) {
      searchParams.append('tmdb_id', params.tmdbId.toString());
      logger.log('🔍 [SEARCH] Usando TMDB ID:', params.tmdbId);
    } else if (params.query) {
      searchParams.append('query', params.query);
      logger.log('🔍 [SEARCH] Usando query:', params.query);
    }

    // Parámetros adicionales
    if (params.languages && params.languages.length > 0) {
      searchParams.append('languages', params.languages.join(','));
    } else {
      // Idiomas por defecto: español e inglés
      searchParams.append('languages', 'es,en');
    }

    if (params.season) {
      searchParams.append('season_number', params.season.toString());
      logger.log('🔍 [SEARCH] Season:', params.season);
    }

    if (params.episode) {
      searchParams.append('episode_number', params.episode.toString());
      logger.log('🔍 [SEARCH] Episode:', params.episode);
    }

    try {
      logger.log('OpenSubtitles Search via Proxy:', {
        url: `/api/subtitles/opensubtitles-search?${searchParams}`,
        params: Object.fromEntries(searchParams)
      });

      // Crear AbortController para timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos timeout

      // Usar el proxy local en lugar de la API directa
      const response = await fetch(`/api/subtitles/opensubtitles-search?${searchParams}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      logger.log('OpenSubtitles Proxy Response:', {
        status: response.status,
        statusText: response.statusText
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        logger.error('OpenSubtitles Proxy Error:', errorData);
        throw new Error(`OpenSubtitles proxy error: ${response.status} ${response.statusText} - ${errorData.message || errorData.error}`);
      }

      const data: OpenSubtitlesResponse = await response.json();
      const subtitles = this.parseSubtitles(data);
      
      // Guardar en cache
      this.searchCache.set(cacheKey, { data: subtitles, timestamp: Date.now() });
      
      // Limpiar cache antiguo (mantener solo los últimos 50 elementos)
      if (this.searchCache.size > 50) {
        const oldestKey = this.searchCache.keys().next().value;
        if (oldestKey) {
          this.searchCache.delete(oldestKey);
        }
      }
      
      return subtitles;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('OpenSubtitles search timeout after 15 seconds');
        throw new Error('Búsqueda de subtítulos cancelada por timeout');
      }
      logger.error('Error searching subtitles:', error);
      throw error;
    }
  }

  private parseSubtitles(response: OpenSubtitlesResponse): SubtitleFile[] {
    return response.data.map(item => ({
      id: item.attributes.files[0]?.file_id?.toString() || item.attributes.subtitle_id,
      language: item.attributes.language,
      languageName: this.getLanguageName(item.attributes.language),
      url: item.attributes.url,
      filename: item.attributes.files[0]?.file_name || 'subtitle.srt',
      downloads: item.attributes.download_count,
      encoding: 'UTF-8', // OpenSubtitles v3 usa UTF-8 por defecto
    }));
  }

  private getLanguageName(languageCode: string): string {
    const languageNames: Record<string, string> = {
      'es': 'Español',
      'en': 'English',
      'fr': 'Français',
      'de': 'Deutsch',
      'it': 'Italiano',
      'pt': 'Português',
      'ru': 'Русский',
      'ja': '日本語',
      'ko': '한국어',
      'zh': '中文',
      'ar': 'العربية',
    };
    
    return languageNames[languageCode] || languageCode.toUpperCase();
  }

  /**
   * Descarga un archivo de subtítulos
   */
  async downloadSubtitle(subtitleId: string): Promise<string> {
    // Verificar cache de descargas
    const cached = this.downloadCache.get(subtitleId);
    if (cached && (Date.now() - cached.timestamp) < this.DOWNLOAD_CACHE_DURATION) {
      logger.log('✅ [SUBTITLE-DOWNLOAD] Cache hit:', subtitleId);
      return cached.data;
    }

    const startTime = Date.now();
    
    try {
      logger.log('⬇️ [SUBTITLE-DOWNLOAD] Iniciando descarga:', subtitleId);
      
      // Crear AbortController para timeout (20s total: 8s link + 10s descarga + margen)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      
      // Usar el proxy local en lugar de la API directa
      const response = await fetch('/api/subtitles/opensubtitles-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file_id: subtitleId }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      
      const elapsed = Date.now() - startTime;
      logger.log(`📊 [SUBTITLE-DOWNLOAD] Response recibida: ${response.status} (${elapsed}ms)`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        logger.error('OpenSubtitles Download Proxy Error:', errorData);
        throw new Error(`Download proxy error: ${response.status} ${response.statusText} - ${errorData.message || errorData.error}`);
      }

      // El proxy puede devolver JSON con la ruta del archivo SRT guardado.
      // Intentamos detectar JSON; si no es JSON, asumimos que es texto SRT directo.
      let srtContent: string = '';
      const contentType = response.headers.get('Content-Type') || '';

      if (contentType.includes('application/json')) {
        const json = await response.json().catch(() => null);
        if (json && json.filePath) {
          try {
            // Preferir la ruta de servicio que agrega headers correctos
            const filename = String(json.filePath).split('/').pop();
            const serveUrl = filename ? `/api/subtitles/serve/${filename}` : String(json.filePath);
            const srtResp = await fetch(serveUrl, { signal: AbortSignal.timeout(8000) });
            if (!srtResp.ok) {
              logger.error('❌ [SUBTITLE-DOWNLOAD] Error obteniendo SRT desde filePath:', srtResp.status, srtResp.statusText);
              throw new Error(`Failed to fetch SRT from filePath (${srtResp.status})`);
            }
            srtContent = await srtResp.text();
            logger.log('✅ [SUBTITLE-DOWNLOAD] SRT obtenido desde filePath vía serve route');
          } catch (e) {
            // Fallback: intentar obtener directamente la ruta estática
            try {
              const staticResp = await fetch(String(json.filePath), { signal: AbortSignal.timeout(8000) });
              if (!staticResp.ok) {
                throw new Error(`Failed to fetch static SRT (${staticResp.status})`);
              }
              srtContent = await staticResp.text();
              logger.log('✅ [SUBTITLE-DOWNLOAD] SRT obtenido desde ruta estática');
            } catch (err) {
              logger.error('❌ [SUBTITLE-DOWNLOAD] No se pudo obtener el SRT desde filePath:', err);
              throw err;
            }
          }
        } else {
          logger.warn('⚠️ [SUBTITLE-DOWNLOAD] Respuesta JSON sin filePath, intentando como texto');
          srtContent = await response.text();
        }
      } else {
        // Si no es JSON, tratar como texto SRT
        srtContent = await response.text();
      }
      const totalTime = Date.now() - startTime;
      
      // Obtener tiempo del servidor si está disponible
      const serverTime = response.headers.get('X-Download-Time');
      logger.log(`✅ [SUBTITLE-DOWNLOAD] Descarga exitosa (total: ${totalTime}ms${serverTime ? `, server: ${serverTime}` : ''})`);
      
      // Guardar en cache
      this.downloadCache.set(subtitleId, { data: srtContent, timestamp: Date.now() });
      
      // Limpiar cache antiguo (mantener solo los últimos 20 elementos)
      if (this.downloadCache.size > 20) {
        const oldestKey = this.downloadCache.keys().next().value;
        if (oldestKey) {
          this.downloadCache.delete(oldestKey);
        }
      }
      
      return srtContent;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error(`❌ [SUBTITLE-DOWNLOAD] Timeout después de ${totalTime}ms`);
        throw new Error(`Descarga de subtítulo cancelada por timeout (${totalTime}ms)`);
      }
      
      logger.error(`❌ [SUBTITLE-DOWNLOAD] Error después de ${totalTime}ms:`, error);
      throw error;
    }
  }

  /**
   * Busca subtítulos directamente por moviehash (sin necesitar File)
   */
  async searchByHash(
    movieHash: string,
    movieByteSize: number,
    metadata?: {
      imdbId?: string;
      tmdbId?: string | number;
      title?: string;
      season?: number;
      episode?: number;
    }
  ): Promise<SubtitleFile[]> {
    try {
      logger.log(`🔍 [SUBTITLES] === BÚSQUEDA INICIADA ===`);
      logger.log(`📝 [SUBTITLES] Hash: ${movieHash}`);
      logger.log(`📏 [SUBTITLES] Tamaño: ${Math.round(movieByteSize / 1024 / 1024)}MB`);
      logger.log(`📋 [SUBTITLES] Metadata:`, metadata);
      
      // Buscar con TODOS los datos disponibles para maximizar resultados
      logger.log(`🔍 [SUBTITLES] Buscando con hash + metadata combinados...`);
      let subtitles = await this.searchSubtitles({
        movieHash,
        byteSize: movieByteSize,
        imdbId: metadata?.imdbId,     // ✨ Ahora incluimos esto desde el inicio
        season: metadata?.season,      // ✨ Y también season
        episode: metadata?.episode,    // ✨ Y episode
        languages: ['es', 'en'],
      });

      if (subtitles.length > 0) {
        logger.log(`✅ [SUBTITLES] Encontrados ${subtitles.length} subtítulos`);
        return subtitles;
      }

      logger.log(`⚠️ [SUBTITLES] No se encontraron subtítulos con hash + metadata`);

      // Fallback: intentar SOLO con IMDb ID si no encontró nada antes
      if (metadata?.imdbId) {
        logger.log(`🔍 [SUBTITLES] Fallback: intentando SOLO con IMDb ID (sin hash)`);
        subtitles = await this.searchSubtitles({
          imdbId: metadata.imdbId,
          season: metadata.season,
          episode: metadata.episode,
          languages: ['es', 'en'],
        });
        
        if (subtitles.length > 0) {
          logger.log(`✅ [SUBTITLES] Encontrados ${subtitles.length} subtítulos por IMDb ID`);
          return subtitles;
        }
        
        logger.log(`⚠️ [SUBTITLES] Tampoco se encontraron por IMDb ID`);
      } else {
        logger.log(`ℹ️ [SUBTITLES] Sin IMDb ID disponible para fallback`);
      }

      logger.log(`❌ [SUBTITLES] === BÚSQUEDA FINALIZADA SIN RESULTADOS ===`);
      return [];
    } catch (error) {
      logger.error('❌ [SUBTITLES] Error buscando por hash:', error);
      return [];
    }
  }

  /**
   * Busca subtítulos para un archivo de video específico
   */
  async findSubtitlesForVideo(
    videoFile: File, 
    metadata?: { 
      imdbId?: string; 
      tmdbId?: string | number; 
      title?: string;
      season?: number;
      episode?: number;
    }
  ): Promise<SubtitleFile[]> {
    try {
      // Primero intentar con moviehash (más preciso)
      const { hash, byteSize } = await this.calculateMovieHash(videoFile);
      
      let subtitles = await this.searchSubtitles({
        movieHash: hash,
        byteSize,
        languages: ['es', 'en'],
      });

      // Si no encuentra subtítulos con hash, intentar con metadata
      if (subtitles.length === 0 && metadata) {
        if (metadata.imdbId) {
          subtitles = await this.searchSubtitles({
            imdbId: metadata.imdbId,
            season: metadata.season,
            episode: metadata.episode,
            languages: ['es', 'en'],
          });
        } else if (metadata.tmdbId) {
          subtitles = await this.searchSubtitles({
            tmdbId: metadata.tmdbId,
            season: metadata.season,
            episode: metadata.episode,
            languages: ['es', 'en'],
          });
        } else if (metadata.title) {
          subtitles = await this.searchSubtitles({
            query: metadata.title,
            season: metadata.season,
            episode: metadata.episode,
            languages: ['es', 'en'],
          });
        }
      }

      return subtitles;
    } catch (error) {
      logger.error('Error finding subtitles for video:', error);
      return [];
    }
  }
}

// Instancia singleton del servicio
export const subtitlesService = new SubtitlesService('SFJNMpk9ULIAfoZpuGR1Jj1BOnuWW8HW');

export type { SubtitleFile };
export { SubtitlesService };