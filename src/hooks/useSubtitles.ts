import { useState, useCallback } from 'react';
import { subtitlesService, type SubtitleFile } from '@/lib/subtitles-service';
import { subtitleLogger, cacheLogger, logger } from '@/lib/logger';

interface UseSubtitlesOptions {
  serverUrl?: string; // URL del VPS para caché de subtítulos
  onError?: (error: string) => void;
}

interface SubtitleState {
  isSearching: boolean;
  isDownloading: boolean;
  availableSubtitles: SubtitleFile[];
  downloadedSubtitles: Array<{
    filename: string;
    language: string; // Código: "es", "en"
    languageName?: string; // Nombre completo: "Español", "English"
    url: string;
  }>;
}

export function useSubtitles({ serverUrl, onError }: UseSubtitlesOptions = {}) {
  const [state, setState] = useState<SubtitleState>({
    isSearching: false,
    isDownloading: false,
    availableSubtitles: [],
    downloadedSubtitles: [],
  });

  const handleError = useCallback((message: string) => {
    logger.error('❌ [SUBTITLES]', message);
    if (onError) onError(message);
  }, [onError]);

  // Buscar subtítulos por hash (automático y preciso)
  const searchByHash = useCallback(async (videoFile: File, metadata?: {
    imdbId?: string;
    tmdbId?: string | number;
    title?: string;
    season?: number;
    episode?: number;
  }) => {
    setState(prev => ({ ...prev, isSearching: true }));

    try {
      subtitleLogger.log('🔍 Buscando por hash...');

      const subtitles = await subtitlesService.findSubtitlesForVideo(videoFile, metadata);

      setState(prev => ({
        ...prev,
        isSearching: false,
        availableSubtitles: subtitles,
      }));

      subtitleLogger.log(`✅ [SUBTITLES] Encontrados ${subtitles.length} subtítulos`);
      return subtitles;

    } catch (error) {
      setState(prev => ({ ...prev, isSearching: false }));
      handleError(error instanceof Error ? error.message : 'Error buscando subtítulos');
      return [];
    }
  }, [handleError]);

  // Descargar subtítulo de OpenSubtitles (con caché)
  const downloadSubtitle = useCallback(async (subtitle: SubtitleFile, videoHash?: string) => {
    setState(prev => ({ ...prev, isDownloading: true }));

    try {
      let vttContent: string = '';
      let fromCache = false;
      let isASS = false; // Bandera para detectar ASS/SSA

      // 1. Intentar obtener desde caché del VPS si tenemos el hash
      if (videoHash) {
        try {
          subtitleLogger.log(`🔍 [CACHE] Verificando caché en VPS para: ${videoHash}_${subtitle.language}`);
          
          const cacheResponse = await fetch(
            `/api/subtitle-cache-proxy?hash=${videoHash}&language=${subtitle.language}`
          );
          const cacheData = await cacheResponse.json();

          if (cacheData.cached && cacheData.content) {
            vttContent = cacheData.content;
            fromCache = true;
            // Detectar si el caché contiene ASS
            isASS = vttContent.trim().startsWith('[Script Info]');
            subtitleLogger.log(`✅ [CACHE] Subtítulo obtenido del caché VPS: ${cacheData.cacheKey}${isASS ? ' (ASS)' : ''}`);
          }
        } catch (cacheError) {
          subtitleLogger.warn('⚠️ [CACHE] Error verificando caché VPS, descargando de OpenSubtitles:', cacheError);
        }
      }

      // 2. Si no está en caché, descargar de OpenSubtitles con retry
      if (!fromCache) {
        subtitleLogger.log('⬇️ Descargando desde OpenSubtitles:', subtitle.filename);

        let srtContent: string = '';
        let lastError: Error | null = null;
        const maxAttempts = 3;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            if (attempt > 1) {
              subtitleLogger.log(`🔄 [SUBTITLES] Reintento ${attempt}/${maxAttempts}...`);
              // Esperar 1 segundo entre reintentos
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            srtContent = await subtitlesService.downloadSubtitle(subtitle.id);
            subtitleLogger.log(`✅ [SUBTITLES] Descarga exitosa en intento ${attempt}/${maxAttempts}`);
            break; // Éxito, salir del bucle
          } catch (error) {
            lastError = error instanceof Error ? error : new Error('Unknown error');
            subtitleLogger.warn(`⚠️ [SUBTITLES] Intento ${attempt}/${maxAttempts} falló:`, lastError.message);
            
            if (attempt === maxAttempts) {
              // Último intento falló, lanzar error
              throw lastError;
            }
          }
        }
        
        // 🎨 DETECTAR SI ES ASS/SSA ANTES DE CONVERTIR
        // Verificar contenido, extensión del archivo, y URL (para Wyzie con format=ssa)
        isASS = srtContent.trim().startsWith('[Script Info]') || 
                subtitle.filename.toLowerCase().endsWith('.ass') || 
                subtitle.filename.toLowerCase().endsWith('.ssa') ||
                ((subtitle as any).url && ((subtitle as any).url.includes('format=ssa') || (subtitle as any).url.includes('format=ass')));
        
        if (isASS) {
          subtitleLogger.log('🎨 [SUBTITLES] Detectado ASS/SSA de OpenSubtitles, NO convirtiendo');
          vttContent = srtContent; // Guardar contenido ASS original sin modificar
        } else {
        // Convertir SRT a VTT inline
        subtitleLogger.log('🔄 [SUBTITLES] Convirtiendo SRT a VTT...');
        vttContent = 'WEBVTT\n\n';
        const lines = srtContent.split(/\r?\n/);
        const timestampRegex = /^\d{2}:\d{2}:\d{2}[,.:]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.:]\d{3}$/;

        const result: string[] = [];
        let currentSubtitle: string[] = [];

        for (const line of lines) {
          const trimmedLine = line.trim();

          // Línea vacía = fin del subtítulo actual
          if (trimmedLine === '') {
            if (currentSubtitle.length > 0) {
              const hasValidTimestamp = currentSubtitle.some(l => timestampRegex.test(l));
              const hasText = currentSubtitle.some(l => 
                !timestampRegex.test(l) && !/^\d+$/.test(l) && l.trim() !== ''
              );

              if (hasValidTimestamp && hasText) {
                result.push(...currentSubtitle);
                result.push('');
              }
              currentSubtitle = [];
            }
            continue;
          }

          // Número de secuencia (ignorar)
          if (/^\d+$/.test(trimmedLine)) {
            continue;
          }

          // Convertir timestamps de SRT a VTT
          if (timestampRegex.test(trimmedLine)) {
            const vttTimestamp = trimmedLine.replace(/,/g, '.');
            currentSubtitle.push(vttTimestamp);
          } else {
            // Texto del subtítulo
            currentSubtitle.push(trimmedLine);
          }
        }

        // Procesar último subtítulo si existe
        if (currentSubtitle.length > 0) {
          const hasValidTimestamp = currentSubtitle.some(l => timestampRegex.test(l.replace(/,/g, '.')));
          const hasText = currentSubtitle.some(l => 
            !timestampRegex.test(l.replace(/,/g, '.')) && !/^\d+$/.test(l) && l.trim() !== ''
          );

          if (hasValidTimestamp && hasText) {
            result.push(...currentSubtitle);
          }
        }

        vttContent = 'WEBVTT\n\n' + result.join('\n');
        subtitleLogger.log('✅ Conversión completada');
        } // Fin del else (conversión SRT->VTT)

        // Guardar en caché del VPS si tenemos el hash (solo VTT, no ASS)
        if (videoHash && !isASS) {
          try {
            await fetch('/api/subtitle-cache-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                hash: videoHash,
                language: subtitle.language,
                content: vttContent,
              }),
            });

            subtitleLogger.log(`✅ [CACHE] Subtítulo guardado en caché VPS`);
          } catch (cacheError) {
            subtitleLogger.warn('⚠️ [CACHE] Error guardando en caché VPS:', cacheError);
            // No fallar si el caché no funciona
          }
        }
      }
      
      const blob = new Blob([vttContent], { type: isASS ? 'text/plain' : 'text/vtt' });
      const url = URL.createObjectURL(blob);

      const downloaded: any = {
        filename: subtitle.filename,
        language: subtitle.language, // Código de idioma: "es", "en", etc.
        languageName: subtitle.languageName, // Nombre completo: "Español", "English"
        url,
      };

      // 🎨 Si es ASS, agregar metadata
      if (isASS) {
        downloaded.isASS = true;
        downloaded.assContent = vttContent; // Contenido ASS original
        subtitleLogger.log('🎨 [SUBTITLES] Subtítulo ASS marcado con metadata');
      }

      // ✅ PREVENIR DUPLICADOS: Verificar si ya existe un subtítulo con el mismo idioma
      setState(prev => {
        const existingSubtitle = prev.downloadedSubtitles.find(
          sub => sub.language === downloaded.language
        );
        
        if (existingSubtitle) {
          subtitleLogger.log(`⏭️ [SUBTITLES] Subtítulo ya agregado (skip): ${downloaded.languageName || downloaded.language}`);
          return { ...prev, isDownloading: false };
        }
        
        subtitleLogger.log(`➕ [SUBTITLES] Agregando: ${downloaded.languageName || downloaded.language} - ${downloaded.filename}`);
        return {
          ...prev,
          isDownloading: false,
          downloadedSubtitles: [...prev.downloadedSubtitles, downloaded],
        };
      });

      subtitleLogger.log('✅ Descargado y listo:', subtitle.filename);
      return downloaded;

    } catch (error) {
      setState(prev => ({ ...prev, isDownloading: false }));
      handleError(error instanceof Error ? error.message : 'Error descargando subtítulo');
      return null;
    }
  }, [handleError]);

  // Buscar subtítulos directamente por hash (sin File)
  const searchByHashDirect = useCallback(async (
    movieHash: string,
    movieByteSize: number,
    metadata?: {
      imdbId?: string;
      tmdbId?: string | number;
      title?: string;
      season?: number;
      episode?: number;
    }
  ) => {
    setState(prev => ({ ...prev, isSearching: true }));

    try {
      // Si no hay hash, intentar búsqueda por metadata
      if (!movieHash && metadata) {
        subtitleLogger.log(`🔍 [SUBTITLES] Sin hash, buscando por metadata: ${JSON.stringify(metadata)}`);
        
        let subtitles: SubtitleFile[] = [];
        
        // Intentar diferentes métodos de búsqueda por metadata
        if (metadata.imdbId) {
          subtitles = await subtitlesService.searchSubtitles({
            imdbId: metadata.imdbId,
            season: metadata.season,
            episode: metadata.episode,
            languages: ['es', 'en'],
          });
        } else if (metadata.tmdbId) {
          subtitles = await subtitlesService.searchSubtitles({
            tmdbId: metadata.tmdbId,
            season: metadata.season,
            episode: metadata.episode,
            languages: ['es', 'en'],
          });
        } else if (metadata.title) {
          subtitles = await subtitlesService.searchSubtitles({
            query: metadata.title,
            season: metadata.season,
            episode: metadata.episode,
            languages: ['es', 'en'],
          });
        }
        
        setState(prev => ({
          ...prev,
          isSearching: false,
          availableSubtitles: subtitles,
        }));
        
        subtitleLogger.log(`✅ [SUBTITLES] Búsqueda por metadata completada: ${subtitles.length} subtítulos encontrados`);
        
        // Auto-descargar subtítulos encontrados
        if (subtitles.length > 0) {
          const esSubtitles = subtitles
            .filter(s => s.language === 'es')
            .sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
          
          const enSubtitles = subtitles
            .filter(s => s.language === 'en')
            .sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
          
          const toDownload: SubtitleFile[] = [];
          
          if (esSubtitles.length > 0) {
            toDownload.push(esSubtitles[0]);
            subtitleLogger.log(`✅ [SUBTITLES] Descargará español: ${esSubtitles[0].filename}`);
          }
          
          if (enSubtitles.length > 0) {
            toDownload.push(enSubtitles[0]);
            subtitleLogger.log(`✅ [SUBTITLES] Descargará inglés: ${enSubtitles[0].filename}`);
          }
          
          // Descargar subtítulos (sin hash para caché)
          for (const subtitle of toDownload) {
            subtitleLogger.log(`⬇️ [SUBTITLES] Descargando: ${subtitle.languageName || subtitle.language} - ${subtitle.filename}`);
            await downloadSubtitle(subtitle); // Sin hash
          }
        }
        
        return subtitles;
      }

      subtitleLogger.log(`🔍 [SUBTITLES] Buscando por hash directo: ${movieHash}`);

      // 1. PRIMERO: Verificar si ambos idiomas ya están en caché del VPS
      try {
        subtitleLogger.log(`🔍 [CACHE-CHECK] Verificando caché del VPS antes de buscar en OpenSubtitles...`);
        
        const [esCacheCheck, enCacheCheck] = await Promise.all([
          fetch(`/api/subtitle-cache-proxy?hash=${movieHash}&language=es`),
          fetch(`/api/subtitle-cache-proxy?hash=${movieHash}&language=en`)
        ]);
          
          const esCache = await esCacheCheck.json();
          const enCache = await enCacheCheck.json();
          
          // Si AMBOS idiomas están en caché, no buscar en OpenSubtitles
          if (esCache.cached && enCache.cached) {
            subtitleLogger.log(`🎯 [CACHE-HIT] Ambos idiomas en caché, saltando búsqueda en OpenSubtitles`);
            
            // Crear subtítulos "dummy" para que el flujo funcione
            const cachedSubtitles = [
              {
                id: `cached_es_${movieHash}`,
                filename: 'Cached Spanish Subtitle',
                language: 'es',
                languageName: 'Español',
                downloads: 99999, // Alto número para que siempre se seleccione
              },
              {
                id: `cached_en_${movieHash}`,
                filename: 'Cached English Subtitle',
                language: 'en',
                languageName: 'English',
                downloads: 99999,
              }
            ];
            
            setState(prev => ({
              ...prev,
              isSearching: false,
              availableSubtitles: cachedSubtitles as any[],
            }));
            
            // Descargar directamente del caché (sin llamar a OpenSubtitles)
            subtitleLogger.log(`⬇️ [CACHE] Descargando español desde caché...`);
            const esBlob = new Blob([esCache.content], { type: 'text/vtt' });
            const esUrl = URL.createObjectURL(esBlob);
            
            setState(prev => {
              const existingEs = prev.downloadedSubtitles.find(sub => sub.language === 'es');
              if (existingEs) {
                subtitleLogger.log(`⏭️ [SUBTITLES] Subtítulo ya agregado (skip): Español`);
                return prev;
              }
              
              subtitleLogger.log(`➕ [SUBTITLES] Agregando: Español - Cached Spanish Subtitle`);
              return {
                ...prev,
                downloadedSubtitles: [...prev.downloadedSubtitles, {
                  filename: 'Cached Spanish Subtitle',
                  language: 'es',
                  languageName: 'Español',
                  url: esUrl,
                }],
              };
            });
            
            subtitleLogger.log(`⬇️ [CACHE] Descargando inglés desde caché...`);
            const enBlob = new Blob([enCache.content], { type: 'text/vtt' });
            const enUrl = URL.createObjectURL(enBlob);
            
            setState(prev => {
              const existingEn = prev.downloadedSubtitles.find(sub => sub.language === 'en');
              if (existingEn) {
                subtitleLogger.log(`⏭️ [SUBTITLES] Subtítulo ya agregado (skip): English`);
                return prev;
              }
              
              subtitleLogger.log(`➕ [SUBTITLES] Agregando: English - Cached English Subtitle`);
              return {
                ...prev,
                downloadedSubtitles: [...prev.downloadedSubtitles, {
                  filename: 'Cached English Subtitle',
                  language: 'en',
                  languageName: 'English',
                  url: enUrl,
                }],
              };
            });
            
            subtitleLogger.log(`✅ [CACHE] Subtítulos cargados completamente desde caché (0 llamadas a OpenSubtitles)`);
            return cachedSubtitles as any[];
          } else {
            subtitleLogger.log(`❌ [CACHE-MISS] No todos los idiomas en caché, buscando en OpenSubtitles...`);
          }
      } catch (cacheError) {
        subtitleLogger.warn(`⚠️ [CACHE-CHECK] Error verificando caché, continuando con OpenSubtitles:`, cacheError);
      }

      // 2. Si no están en caché, buscar en OpenSubtitles (flujo normal)
      const subtitles = await subtitlesService.searchByHash(movieHash, movieByteSize, metadata);

      setState(prev => ({
        ...prev,
        isSearching: false,
        availableSubtitles: subtitles,
      }));

      subtitleLogger.log(`✅ [SUBTITLES] Encontrados ${subtitles.length} subtítulos`);
      subtitleLogger.log(`📋 [SUBTITLES] Idiomas disponibles:`, subtitles.map(s => s.language).join(', '));
      
      // Auto-descargar subtítulos: SIEMPRE priorizar español, luego inglés
      if (subtitles.length > 0) {
        // Buscar TODOS los subtítulos en español e inglés (ordenados por descargas)
        const esSubtitles = subtitles
          .filter(s => s.language === 'es')
          .sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
        
        const enSubtitles = subtitles
          .filter(s => s.language === 'en')
          .sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
        
        subtitleLogger.log(`🇪🇸 [SUBTITLES] Subtítulos en español encontrados: ${esSubtitles.length}`);
        subtitleLogger.log(`🇬🇧 [SUBTITLES] Subtítulos en inglés encontrados: ${enSubtitles.length}`);
        
        // Verificar caché y descargar al menos 1 en español y 1 en inglés
        const toDownload: SubtitleFile[] = [];
        
        if (esSubtitles.length > 0) {
          toDownload.push(esSubtitles[0]); // Mejor subtítulo en español
          subtitleLogger.log(`✅ [SUBTITLES] Descargará español: ${esSubtitles[0].filename} (${esSubtitles[0].downloads} descargas)`);
        } else {
          subtitleLogger.warn(`⚠️ [SUBTITLES] No se encontraron subtítulos en español`);
        }
        
        if (enSubtitles.length > 0) {
          toDownload.push(enSubtitles[0]); // Mejor subtítulo en inglés
          subtitleLogger.log(`✅ [SUBTITLES] Descargará inglés: ${enSubtitles[0].filename} (${enSubtitles[0].downloads} descargas)`);
        }
        
        // Descargar en orden: español primero, luego inglés (con caché)
        for (const subtitle of toDownload) {
          subtitleLogger.log(`⬇️ [SUBTITLES] Descargando: ${subtitle.languageName || subtitle.language} - ${subtitle.filename}`);
          await downloadSubtitle(subtitle, movieHash); // Pasar el hash para caché
        }
        
        if (toDownload.length === 0) {
          subtitleLogger.warn(`⚠️ [SUBTITLES] No hay subtítulos en español ni inglés disponibles`);
        }
      }

      return subtitles;

    } catch (error) {
      setState(prev => ({ ...prev, isSearching: false }));
      handleError(error instanceof Error ? error.message : 'Error buscando subtítulos');
      return [];
    }
  }, [handleError, downloadSubtitle]);

  // Cargar subtítulo externo (file upload)
  const loadExternalSubtitle = useCallback((file: File) => {
    try {
      const url = URL.createObjectURL(file);

      // Detectar idioma del nombre del archivo
      const filename = file.name.toLowerCase();
      let language = 'unknown';
      let languageName = 'Desconocido';
      
      if (filename.includes('spanish') || filename.includes('esp') || filename.includes('.es.')) {
        language = 'es';
        languageName = 'Español';
      } else if (filename.includes('english') || filename.includes('eng') || filename.includes('.en.')) {
        language = 'en';
        languageName = 'English';
      }

      const downloaded = {
        filename: file.name,
        language,
        languageName,
        url,
      };

      setState(prev => ({
        ...prev,
        downloadedSubtitles: [...prev.downloadedSubtitles, downloaded],
      }));

      subtitleLogger.log('✅ Archivo cargado:', file.name);
      return downloaded;

    } catch (error) {
      handleError('Error cargando archivo de subtítulo');
      return null;
    }
  }, [handleError]);

  // Convertir SRT a VTT (necesario para el player)
  const convertSRTtoVTT = useCallback((srtContent: string): string => {
    try {
      subtitleLogger.log('[SUBTITLES] Convirtiendo SRT a VTT...');

      let vttContent = 'WEBVTT\n\n';
      const lines = srtContent.split(/\r?\n/);
      const timestampRegex = /^\d{2}:\d{2}:\d{2}[,.:]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.:]\d{3}$/;

      const result: string[] = [];
      let currentSubtitle: string[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Línea vacía = fin del subtítulo actual
        if (trimmedLine === '') {
          if (currentSubtitle.length > 0) {
            const hasValidTimestamp = currentSubtitle.some(l => timestampRegex.test(l));
            const hasText = currentSubtitle.some(l => 
              !timestampRegex.test(l) && !/^\d+$/.test(l) && l.trim() !== ''
            );

            if (hasValidTimestamp && hasText) {
              result.push(...currentSubtitle);
              result.push('');
            }
            currentSubtitle = [];
          }
          continue;
        }

        // Saltar números de secuencia
        if (/^\d+$/.test(trimmedLine)) {
          continue;
        }

        // Timestamp - convertir comas a puntos
        if (timestampRegex.test(trimmedLine)) {
          const vttTimestamp = trimmedLine.replace(/,/g, '.');
          currentSubtitle.push(vttTimestamp);
          continue;
        }

        // Texto del subtítulo
        if (trimmedLine.length > 0) {
          currentSubtitle.push(trimmedLine);
        }
      }

      // Procesar último subtítulo
      if (currentSubtitle.length > 0) {
        const hasValidTimestamp = currentSubtitle.some(l => timestampRegex.test(l));
        const hasText = currentSubtitle.some(l => 
          !timestampRegex.test(l) && !/^\d+$/.test(l) && l.trim() !== ''
        );

        if (hasValidTimestamp && hasText) {
          result.push(...currentSubtitle);
        }
      }

      vttContent += result.join('\n');

      subtitleLogger.log('✅ Conversión SRT→VTT exitosa');
      return vttContent;

    } catch (error) {
      logger.error('❌ [SUBTITLES] Error en conversión:', error);
      return 'WEBVTT\n\n';
    }
  }, []);

  // Buscar y descargar subtítulos usando Wyzie (más simple y directo)
  const searchWyzie = useCallback(async (metadata: {
    imdbId?: string;
    tmdbId?: string | number;
    title?: string;
    season?: number;
    episode?: number;
    source?: string; // opensubtitles, subdivx, etc.
    languages?: string[]; // ['es', 'en'] por defecto
  }) => {
    setState(prev => ({ ...prev, isSearching: true }));

    try {
      subtitleLogger.log('🔍 [WYZIE] Buscando subtítulos con metadata:', metadata);

      // Buscar español e inglés en paralelo (o los idiomas especificados)
      const languages = metadata.languages || ['es', 'en'];
      const promises = languages.map(async (lang) => {
        try {
          const params = new URLSearchParams();
          
          if (metadata.tmdbId) {
            params.append('tmdbId', metadata.tmdbId.toString());
          } else if (metadata.imdbId) {
            params.append('imdbId', metadata.imdbId);
          } else {
            return null;
          }

          params.append('language', lang);
          
          // Filtrar por fuente si se especifica
          if (metadata.source) {
            params.append('source', metadata.source);
          }
          
          if (metadata.season) {
            params.append('season', metadata.season.toString());
          }
          if (metadata.episode) {
            params.append('episode', metadata.episode.toString());
          }

          const url = `/api/wyzie-subtitles?${params.toString()}`;
          subtitleLogger.log(`🌐 [WYZIE] Buscando ${lang}:`, url);

          const response = await fetch(url);
          
          if (!response.ok) {
            subtitleLogger.warn(`⚠️ [WYZIE] No encontrado para ${lang}:`, response.status);
            return null;
          }

          const contentType = response.headers.get('content-type');
          
          // Si es JSON, hay múltiples subtítulos disponibles
          if (contentType?.includes('application/json')) {
            const data = await response.json();
            if (data.success && data.subtitles && data.subtitles.length > 0) {
              // Tomar el primero
              const subtitle = data.subtitles[0];
              const vttContent = subtitle.vtt;
              
              // 🎨 Detectar si es ASS/SSA
              const isASS = vttContent.includes('[Script Info]') || 
                           vttContent.includes('[V4+ Styles]') ||
                           subtitle.format === 'ass' ||
                           subtitle.format === 'ssa' ||
                           subtitle.isASS === true;
              
              if (isASS) {
                subtitleLogger.log(`🎨 [WYZIE] Subtítulo ASS/SSA detectado: ${subtitle.display || lang}`);
                
                // En lugar de emitir evento aquí, retornar como subtítulo especial
                // El contenido ASS se guardará en el Blob pero con metadata especial
                const blob = new Blob([vttContent], { type: 'text/x-ass; charset=utf-8' });
                const url = URL.createObjectURL(blob);
                
                subtitleLogger.log('🎨 [WYZIE] ASS retornado como track especial con metadata isASS=true');
                
                return {
                  filename: `${subtitle.display || lang}.ass`,
                  language: lang,
                  languageName: lang === 'es' ? 'Español' : 'English',
                  url,
                  isASS: true, // 🔑 Metadata para identificar ASS
                  assContent: vttContent, // 🔑 Contenido ASS original
                };
              }
              
              const blob = new Blob([vttContent], { type: 'text/vtt; charset=utf-8' });
              const url = URL.createObjectURL(blob);
              
              return {
                filename: `${subtitle.display || lang}.vtt`,
                language: lang,
                languageName: lang === 'es' ? 'Español' : 'English',
                url,
              };
            }
          } else {
            // VTT directo
            const vttContent = await response.text();
            
            // 🎨 Detectar si es ASS/SSA también en VTT directo
            const isASS = vttContent.includes('[Script Info]') || 
                         vttContent.includes('[V4+ Styles]');
            
            if (isASS) {
              subtitleLogger.log(`🎨 [WYZIE] Subtítulo ASS/SSA detectado en VTT directo: ${lang}`);
              const blob = new Blob([vttContent], { type: 'text/x-ass; charset=utf-8' });
              const url = URL.createObjectURL(blob);
              
              return {
                filename: `${lang === 'es' ? 'Español' : 'English'} (Wyzie).ass`,
                language: lang,
                languageName: lang === 'es' ? 'Español' : 'English',
                url,
                isASS: true,
                assContent: vttContent,
              };
            }
            
            const blob = new Blob([vttContent], { type: 'text/vtt; charset=utf-8' });
            const url = URL.createObjectURL(blob);
            
            return {
              filename: `${lang === 'es' ? 'Español' : 'English'} (Wyzie).vtt`,
              language: lang,
              languageName: lang === 'es' ? 'Español' : 'English',
              url,
            };
          }
        } catch (error) {
          subtitleLogger.warn(`⚠️ [WYZIE] Error descargando ${lang}:`, error);
          return null;
        }
        
        return null;
      });

      const results = await Promise.all(promises);
      const downloadedSubs = results.filter(Boolean) as Array<{
        filename: string;
        language: string;
        languageName: string;
        url: string;
        isASS?: boolean;
        assContent?: string;
      }>;

      setState(prev => ({
        ...prev,
        isSearching: false,
        downloadedSubtitles: [...prev.downloadedSubtitles, ...downloadedSubs],
      }));

      subtitleLogger.log(`✅ [WYZIE] ${downloadedSubs.length} subtítulos descargados`);
      return downloadedSubs;

    } catch (error) {
      setState(prev => ({ ...prev, isSearching: false }));
      handleError(error instanceof Error ? error.message : 'Error buscando subtítulos en Wyzie');
      return [];
    }
  }, [handleError]);

  // Limpiar URLs de objetos
  const cleanup = useCallback(() => {
    state.downloadedSubtitles.forEach(sub => {
      URL.revokeObjectURL(sub.url);
    });
    setState({
      isSearching: false,
      isDownloading: false,
      availableSubtitles: [],
      downloadedSubtitles: [],
    });
  }, [state.downloadedSubtitles]);

  return {
    ...state,
    searchByHash,
    searchByHashDirect,
    searchWyzie,
    downloadSubtitle,
    loadExternalSubtitle,
    convertSRTtoVTT,
    cleanup,
  };
}

