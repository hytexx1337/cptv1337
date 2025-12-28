"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import StreamingPlayer from '@/components/streaming/StreamingPlayer';
import { getImageUrl } from '@/lib/tmdb';
import { useDownloadedFiles, DownloadedFile } from '@/hooks/useDownloadedFiles';
import { watchHistory } from '@/lib/watch-history';
import { logger, playerLogger } from '@/lib/logger';
import { TMDBImages } from '@/types/tmdb';
import { fetchUnifiedStreams, convertToLegacyFormat } from '@/lib/unifiedStreamingApi';

interface ClientPlayerProps {
  type?: string;
  id?: string;
  season?: string;
  episode?: string;
}

export default function ClientPlayer({ type, id, season, episode }: ClientPlayerProps) {
  const router = useRouter();
  const normalizedType = (type || 'movie').toLowerCase();
  const tmdbId = useMemo(() => {
    const num = id ? parseInt(id) : NaN;
    return Number.isFinite(num) ? num : null;
  }, [id]);
  const seasonNum = useMemo(() => {
    const num = season ? parseInt(season) : NaN;
    return Number.isFinite(num) ? num : undefined;
  }, [season]);
  const episodeNum = useMemo(() => {
    const num = episode ? parseInt(episode) : NaN;
    return Number.isFinite(num) ? num : undefined;
  }, [episode]);

  const isTv = normalizedType === 'tv';

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [goFileUrl, setGoFileUrl] = useState<string | undefined>(undefined);
  const [externalSubtitles, setExternalSubtitles] = useState<Array<{ url: string; language: string; label: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedFile, setSelectedFile] = useState<DownloadedFile | null>(null);
  const [title, setTitle] = useState<string>('');
  const [imdbId, setImdbId] = useState<string | undefined>(undefined);
  const [backdropPath, setBackdropPath] = useState<string | undefined>(undefined);
  const [logoPath, setLogoPath] = useState<string | undefined>(undefined);
  const [year, setYear] = useState<number | undefined>(undefined);
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [overview, setOverview] = useState<string | undefined>(undefined);
  const [hasNextEpisode, setHasNextEpisode] = useState<boolean>(false);
  const [videoHasStarted, setVideoHasStarted] = useState(false);
  const [customStreamUrl, setCustomStreamUrl] = useState<string | null>(null);
  const [englishDubStreamUrl, setEnglishDubStreamUrl] = useState<string | null>(null);
  const [originCountries, setOriginCountries] = useState<string[]>([]); // Para filtrar English Dub si es de país de habla inglesa

  const { getMovieFiles, getEpisodeFiles, updateLastAccessed } = useDownloadedFiles({
    onError: (msg) => logger.error('DownloadedFiles error:', msg)
  });

  // Ref para evitar múltiples inicializaciones (React Strict Mode)
  const isInitializedRef = useRef(false);
  const initKeyRef = useRef('');

  // Helper: Verificar si el contenido es de un país de habla inglesa
  const isFromEnglishSpeakingCountry = useCallback((countries: string[]): boolean => {
    const englishSpeakingCountries = ['US', 'GB', 'CA', 'AU', 'NZ', 'IE'];
    return countries.some(country => englishSpeakingCountries.includes(country));
  }, []);

  // Handler para cambiar de episodio - SIMPLEMENTE CAMBIAR LA URL
  const handleEpisodeSelect = useCallback((newSeason: number, newEpisode: number, episodeData: any) => {
    if (!isTv || !tmdbId) {
      logger.warn(`❌ [CLIENT-PLAYER] [EPISODE-SELECT] No hay tmdbId, saliendo`);
      return;
    }

    logger.log(`⏭️ [CLIENT-PLAYER] [EPISODE-SELECT] Navegando a S${newSeason}E${newEpisode}`);
    
    // 🔧 IMPORTANTE: Limpiar streams ANTES de navegar para evitar que StreamingPlayer use datos viejos
    setStreamUrl(null);
    setGoFileUrl(undefined);
    setCustomStreamUrl(null);
    setEnglishDubStreamUrl(null);
    setLoading(true);
    
    // Cambiar URL - el useEffect va a cargar los datos nuevos
    const newUrl = `/watch?type=tv&id=${tmdbId}&season=${newSeason}&episode=${newEpisode}`;
    router.push(newUrl);
  }, [isTv, tmdbId, router]);

  // Handler para el botón "Atrás" - volver a la página principal del contenido
  const handleClose = useCallback(() => {
    if (!tmdbId) return;
    
    const backUrl = isTv ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
    logger.log(`🔙 [CLOSE] Volviendo a: ${backUrl}`);
    router.push(backUrl);
  }, [tmdbId, isTv, router]);

  // Memoizar movieMetadata para evitar re-renders innecesarios de StreamingPlayer
  const memoizedMovieMetadata = useMemo(() => ({
    tmdbId: tmdbId ?? undefined,
    title,
    imdbId,
    season: isTv ? seasonNum : undefined,
    episode: isTv ? episodeNum : undefined,
    backdropPath,
    logoPath,
    year,
    rating,
    overview,
  }), [tmdbId, title, imdbId, isTv, seasonNum, episodeNum, backdropPath, logoPath, year, rating, overview]);

  // Memoizar tvMetadata para evitar re-renders innecesarios
  const memoizedTvMetadata = useMemo(() => 
    isTv ? { tmdbId: tmdbId ?? undefined, title, season: seasonNum, episode: episodeNum } : undefined
  , [isTv, tmdbId, title, seasonNum, episodeNum]);

  // DEBUG: Log cuando el componente se monta/desmonta
  useEffect(() => {
    logger.log('🔷 [CLIENT-PLAYER] Componente MONTADO', {
      type: normalizedType,
      id: tmdbId,
      season: seasonNum,
      episode: episodeNum,
    });
    return () => {
      logger.log('🔶 [CLIENT-PLAYER] Componente DESMONTADO');
    };
  }, []);

  useEffect(() => {
    // Generar clave única para esta combinación de parámetros
    const currentKey = `${normalizedType}-${tmdbId}-${seasonNum}-${episodeNum}`;
    
    logger.log('🔄 [CLIENT-PLAYER] useEffect ejecutado', {
      type: normalizedType,
      id: tmdbId,
      season: seasonNum,
      episode: episodeNum,
      isTv,
      currentKey,
      previousKey: initKeyRef.current,
      isInitialized: isInitializedRef.current,
    });

    // Si ya se inicializó con estos mismos parámetros, no hacer nada (React Strict Mode)
    if (isInitializedRef.current && initKeyRef.current === currentKey) {
      logger.log('⏭️ [CLIENT-PLAYER] Ya inicializado con estos parámetros, saltando init()');
      return;
    }

    // Marcar como inicializado y guardar la clave
    isInitializedRef.current = true;
    initKeyRef.current = currentKey;

    const init = async () => {
      try {
        logger.log('🚀 [CLIENT-PLAYER] Iniciando carga de metadata', {
          type: normalizedType,
          id: tmdbId,
          season: seasonNum,
          episode: episodeNum,
        });
        setLoading(true);
        setError(null);
        setVideoHasStarted(false); // Resetear cuando se carga nuevo contenido
        if (!tmdbId) {
          setError('Falta parámetro id');
          setLoading(false);
          return;
        }

        let imdbIdLocal: string | undefined = undefined;
        let localOriginCountries: string[] = []; // Variable local para evaluación inmediata

        // 🚀 OPTIMIZACIÓN: Llamadas en paralelo para no bloquear
        try {
          if (isTv) {
            // Fetch básico de TV (SOLO países de origen, necesario para filtro de English Dub)
            const tvRes = await fetch(`/api/tv/${tmdbId}`);
            if (tvRes.ok) {
              const tv = await tvRes.json();
              setTitle(
                seasonNum && episodeNum
                  ? `${tv.name} S${seasonNum}E${episodeNum}`
                  : tv.name
              );
              setBackdropPath(tv.backdrop_path ? getImageUrl(tv.backdrop_path, 'original') : undefined);
              setYear(tv.first_air_date ? new Date(tv.first_air_date).getFullYear() : undefined);
              setRating(tv.vote_average);
              setOverview(tv.overview); // Usar overview de serie por ahora
              
              // ✅ CRÍTICO: Países de origen (necesario para filtro de English Dub)
              if (tv.origin_country && Array.isArray(tv.origin_country)) {
                localOriginCountries = tv.origin_country;
                setOriginCountries(tv.origin_country);
                logger.log(`🌍 [CLIENT-PLAYER] Países de origen (TV): ${tv.origin_country.join(', ')}`);
              }
              
              // Obtener IMDB ID si está disponible
              if (tv.external_ids?.imdb_id) {
                imdbIdLocal = tv.external_ids.imdb_id;
              }
              
              // 🔄 BACKGROUND: Logo, sinopsis del episodio, external IDs, siguiente episodio
              (async () => {
                try {
                  // Logo
                  const imagesRes = await fetch(`/api/tv/${tmdbId}/images`);
                  if (imagesRes.ok) {
                    const images: TMDBImages = await imagesRes.json();
                    const originalLogo = images.logos?.find(l => l.iso_639_1 === 'en' || l.iso_639_1 === null) || images.logos?.[0];
                    if (originalLogo?.file_path) {
                      setLogoPath(getImageUrl(originalLogo.file_path, 'original'));
                    }
                  }
                  
                  // Sinopsis del episodio y siguiente episodio
              if (seasonNum && episodeNum) {
                  const seasonRes = await fetch(`/api/tv/${tmdbId}/season/${seasonNum}`);
                  if (seasonRes.ok) {
                    const seasonData = await seasonRes.json();
                    const currentEp = seasonData.episodes?.find((ep: any) => ep.episode_number === episodeNum);
                    setOverview(currentEp?.overview || tv.overview);
                    
                    const currentEpIndex = seasonData.episodes?.findIndex((ep: any) => ep.episode_number === episodeNum);
                    if (currentEpIndex !== -1 && currentEpIndex < seasonData.episodes.length - 1) {
                        setHasNextEpisode(true);
                    } else {
                      const nextSeason = tv.seasons?.find((s: any) => s.season_number === seasonNum + 1);
                      setHasNextEpisode(!!nextSeason && (nextSeason.episode_count ?? 0) > 0);
                    }
                  }
              }
              
                  // External IDs (IMDB)
              const extRes = await fetch(`/api/tv/${tmdbId}/external_ids`);
              if (extRes.ok) {
                const ext = await extRes.json();
                    setImdbId(ext.imdb_id || undefined);
                  }
                } catch (err) {
                  logger.warn('[BACKGROUND] Error cargando metadata adicional:', err);
              }
              })();
            }
          } else {
            // Fetch básico de Movie (SOLO países de producción, necesario para filtro de English Dub)
            const movieRes = await fetch(`/api/movie/${tmdbId}`);
            if (movieRes.ok) {
              const movie = await movieRes.json();
              setTitle(`${movie.title}${movie.release_date ? ` (${new Date(movie.release_date).getFullYear()})` : ''}`);
              setBackdropPath(movie.backdrop_path ? getImageUrl(movie.backdrop_path, 'original') : undefined);
              setYear(movie.release_date ? new Date(movie.release_date).getFullYear() : undefined);
              setRating(movie.vote_average);
              setOverview(movie.overview);
              
              // ✅ CRÍTICO: Países de producción (necesario para filtro de English Dub)
              if (movie.production_countries && Array.isArray(movie.production_countries)) {
                const countryCodes = movie.production_countries.map((c: any) => c.iso_3166_1);
                localOriginCountries = countryCodes;
                setOriginCountries(countryCodes);
                logger.log(`🌍 [CLIENT-PLAYER] Países de producción (Movie): ${countryCodes.join(', ')}`);
              }
              
              imdbIdLocal = movie.imdb_id || undefined;
              
              // 🔄 BACKGROUND: Logo y external IDs (si no tiene IMDB)
              (async () => {
                try {
                  // Logo
                const imagesRes = await fetch(`/api/movie/${tmdbId}/images`);
                if (imagesRes.ok) {
                  const images: TMDBImages = await imagesRes.json();
                  const originalLogo = images.logos?.find(l => l.iso_639_1 === 'en' || l.iso_639_1 === null) || images.logos?.[0];
                  if (originalLogo?.file_path) {
                    setLogoPath(getImageUrl(originalLogo.file_path, 'original'));
                  }
                }
                  
                  // External IDs solo si no tenemos IMDB
                  if (!movie.imdb_id) {
                const extRes = await fetch(`/api/movie/${tmdbId}/external_ids`);
                if (extRes.ok) {
                  const ext = await extRes.json();
                      setImdbId(ext.imdb_id || undefined);
                }
              }
                } catch (err) {
                  logger.warn('[BACKGROUND] Error cargando metadata adicional:', err);
                }
              })();
              
              setImdbId(imdbIdLocal);
            }
          }
        } catch (metaErr) {
          logger.warn('No se pudo cargar metadata mínima para watch:', metaErr);
        }

        try {
          if (isTv && seasonNum && episodeNum) {
            const saved = watchHistory.getProgress('tv', tmdbId.toString(), seasonNum, episodeNum);
            if (saved?.currentTime && saved.currentTime > 0) {
              (window as any).resumeTime = saved.currentTime;
              playerLogger.log(`⏰ [RESUME@WATCH] S${seasonNum}E${episodeNum} desde ${saved.currentTime}s`);
            }
          } else {
            const saved = watchHistory.getProgress('movie', tmdbId.toString());
            if (saved?.currentTime && saved.currentTime > 0) {
              (window as any).resumeTime = saved.currentTime;
              playerLogger.log(`⏰ [RESUME@WATCH] Película desde ${saved.currentTime}s`);
            }
          }
        } catch {}

        // 🚀 NUEVA ESTRATEGIA: API UNIFICADA
        // Una sola llamada obtiene todos los idiomas en paralelo desde el backend:
        // - Original: Vidlink (movies/series) o Anime SUB (anime japonés)
        // - English Dub: Vidify (movies/series) o Anime DUB (anime japonés)
        // - Latino: Cuevana (siempre)
        
        logger.log('🚀 [CLIENT-PLAYER] Llamando a API unificada de streaming...');
        
        // ✨ UNA SOLA LLAMADA para obtener TODOS los idiomas
        try {
          const unifiedData = await fetchUnifiedStreams({
            type: normalizedType as 'movie' | 'tv',
            tmdbId,
            season: seasonNum,
            episode: episodeNum,
          });

          // Convertir al formato legacy de la app
          const { original, latino, englishDub, metadata } = convertToLegacyFormat(unifiedData);

          logger.log(`⏱️ [CLIENT-PLAYER] API unificada completada en ${metadata.totalTimeMs}ms`);
          logger.log(`📊 [CLIENT-PLAYER] Streams obtenidos: ${metadata.successCount}/3`);
          
          if (metadata.isAnime) {
            logger.log(`🎌 [CLIENT-PLAYER] Detectado como ANIME: ${metadata.animeTitle}`);
          }

          let hasAnyStream = false;
          let streamCount = 0;

          // Helper: Detectar si es URL directa (necesita proxy de CORS)
          const needsCorsProxy = (url: string) => {
            return url.startsWith('https://') && !url.startsWith('/api/');
          };

          // 1. PROCESAR ORIGINAL (Vidlink o Anime SUB)
          if (original?.playlistUrl) {
            // Si es anime (URL directa), usar proxy de CORS
            const streamUrl = needsCorsProxy(original.playlistUrl)
              ? original.playlistUrl  // Para anime, ya viene la URL directa sin proxy
              : original.playlistUrl;
            
            setStreamUrl(streamUrl);
            logger.log(`✅ [CLIENT-PLAYER] Stream Original desde ${original.source}${original.cached ? ' [CACHÉ]' : ''}`);
            
            // Subtítulos - Mapear correctamente la estructura
            if (original.subtitles && original.subtitles.length > 0) {
              const mappedSubtitles = original.subtitles.map((sub: any) => ({
                url: sub.url,
                language: sub.lang || sub.language || 'unknown',
                label: sub.label || sub.lang || 'Unknown',
              }));
              setExternalSubtitles(mappedSubtitles);
              logger.log(`📝 [CLIENT-PLAYER] ${mappedSubtitles.length} subtítulos de ${original.source}`);
            }
            
            hasAnyStream = true;
            streamCount++;
          } else {
            logger.warn('⚠️ [CLIENT-PLAYER] No hay stream Original disponible');
            
            // 🔄 FALLBACK: Si no hay Original, intentar usar Latino como principal
            if (latino?.streamUrl) {
              setStreamUrl(latino.streamUrl);
              logger.log(`🔄 [CLIENT-PLAYER] Usando Latino como stream principal (fallback)`);
              hasAnyStream = true;
              streamCount++;
            }
          }

          // 2. PROCESAR ENGLISH DUB (Vidify o Anime DUB)
          if (englishDub?.streamUrl) {
            const isEnglishOrigin = isFromEnglishSpeakingCountry(localOriginCountries);
            
            if (isEnglishOrigin) {
              logger.log(`🚫 [CLIENT-PLAYER] English Dub omitido (país de habla inglesa: ${localOriginCountries.join(', ')})`);
            } else {
              setEnglishDubStreamUrl(englishDub.streamUrl);
              logger.log(`✅ [CLIENT-PLAYER] English Dub agregado desde ${englishDub.provider}${englishDub.cached ? ' [CACHÉ]' : ''}`);
              streamCount++;
              // No afecta hasAnyStream porque es stream adicional, no principal
            }
          } else {
            logger.log('ℹ️ [CLIENT-PLAYER] English Dub no disponible');
          }

          // 3. PROCESAR LATINO (Cuevana)
          // Solo agregar a customStreamUrl si NO se usó como stream principal
          if (latino?.streamUrl && original?.playlistUrl) {
            // Hay Original, entonces Latino va como alternativa
            // 🆕 Si vienen headers, agregarlos a la URL del proxy
            let latinoUrl = latino.streamUrl;
            if (latino.headers) {
              const headersParam = `&referer=${encodeURIComponent(latino.headers.referer)}&origin=${encodeURIComponent(latino.headers.origin)}`;
              latinoUrl = `/api/vidify-proxy/m3u8?url=${encodeURIComponent(latino.streamUrl)}${headersParam}`;
              logger.log(`🔑 [CLIENT-PLAYER] Latino con headers custom: Referer=${latino.headers.referer}`);
            }
            setCustomStreamUrl(latinoUrl);
            logger.log(`✅ [CLIENT-PLAYER] Latino agregado desde ${latino.provider}${latino.cached ? ' [CACHÉ]' : ''}`);
            streamCount++;
            // No afecta hasAnyStream porque es stream adicional, no principal
          } else if (!latino?.streamUrl) {
            logger.log('ℹ️ [CLIENT-PLAYER] Latino no disponible');
          } else {
            logger.log(`ℹ️ [CLIENT-PLAYER] Latino ya está como stream principal, no se agrega a customStreamUrl`);
          }

          logger.log(`📊 [CLIENT-PLAYER] Resumen: ${streamCount} streams disponibles (al menos 1 principal: ${hasAnyStream})`);

          // Si tenemos al menos un stream, iniciar reproducción
          if (hasAnyStream) {
            setLoading(false);
            playerLogger.log(`🎬 [WATCH] Streams cargados desde API unificada, iniciando reproducción...`);
            return; // ✅ Éxito
          }

          logger.error('❌ [CLIENT-PLAYER] API unificada no devolvió ningún stream válido');
          setLoading(false);
          setError('No se encontraron streams disponibles para este contenido');
          return;
        } catch (err) {
          logger.error('❌ [CLIENT-PLAYER] Error llamando a API unificada:', err);
          setLoading(false);
          setError('Error al obtener streams: ' + (err instanceof Error ? err.message : 'Unknown'));
          return;
        }

        // 🚫 NO HAY FALLBACK - Solo API unificada
        // El error ya se mostró arriba
      } catch (err: any) {
        logger.error('Error en /watch:', err);
        setError(err?.message || 'Error al preparar reproducción');
        setLoading(false);
      }
    };

    init().then(() => {
      logger.log('✅ [CLIENT-PLAYER] init() completado');
    }).catch((err) => {
      logger.error('❌ [CLIENT-PLAYER] init() falló:', err);
    });

    return () => {
      logger.log('🧹 [CLIENT-PLAYER] Cleanup ejecutado (componente desmontado o deps cambiaron)', {
        type: normalizedType,
        id: tmdbId,
        season: seasonNum,
        episode: episodeNum,
        currentKey,
      });
      
      // Solo resetear si realmente cambió el contenido (no en React Strict Mode)
      const newKey = `${normalizedType}-${tmdbId}-${seasonNum}-${episodeNum}`;
      if (initKeyRef.current !== newKey) {
        logger.log('🧹 [CLIENT-PLAYER] Reseteando refs (contenido cambió)');
        isInitializedRef.current = false;
        initKeyRef.current = '';
      } else {
        logger.log('⏭️ [CLIENT-PLAYER] Manteniendo refs (mismo contenido, React Strict Mode)');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedType, tmdbId, seasonNum, episodeNum]);

  // Mostrar estado de carga mejorado mientras se inicializa (SOLO hasta que tengamos streamUrl)
  if (loading && (!streamUrl && !goFileUrl)) {
    return (
      <div className="fixed inset-0 bg-black z-[100] overflow-hidden">
        {/* Backdrop */}
        {backdropPath && (
          <div className="absolute inset-0">
            <img
              src={backdropPath}
              alt={title || 'Loading'}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          </div>
        )}

        {/* Contenido centrado */}
        <div className="relative z-10 flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-6">
            {logoPath && (
              <div className="max-w-xs w-full px-8">
                <img
                  src={logoPath}
                  alt={title || 'Loading'}
                  className="w-full h-auto"
                />
              </div>
            )}
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!tmdbId && !streamUrl && !goFileUrl) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center">
        Falta parámetro id
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-[100] overflow-hidden">
      <div className="absolute inset-0">
        {/* Solo renderizar StreamingPlayer cuando NO está cargando */}
        {!loading ? (
        <StreamingPlayer
            key={`watch-${isTv ? `tv-${tmdbId}-s${seasonNum}-e${episodeNum}` : `movie-${tmdbId}`}`}
          goFileUrl={goFileUrl}
          directStreamUrl={streamUrl || undefined}
          customStreamUrl={customStreamUrl || undefined}
            englishDubStreamUrl={englishDubStreamUrl || undefined}
          externalSubtitles={externalSubtitles}
          hasNextEpisode={hasNextEpisode}
          movieMetadata={memoizedMovieMetadata}
          tvMetadata={memoizedTvMetadata}
          isModalPlayer={true}
          onError={(e) => {
            setError(e);
          }}
          onTimeUpdate={(time) => {
            // Marcar que el video ha empezado cuando pasa 0.1s
            if (time > 0.1 && !videoHasStarted) {
              setVideoHasStarted(true);
            }
          }}
          onEpisodeSelect={isTv ? handleEpisodeSelect : undefined}
            onClose={handleClose}
        />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-white text-xl">Cargando episodio...</div>
          </div>
        )}
      </div>
      
      {/* Overlay que permanece visible hasta que el video empiece */}
      {!videoHasStarted && (streamUrl || goFileUrl) && (
        <div className="fixed inset-0 bg-black z-[150] overflow-hidden pointer-events-none">
          {/* Backdrop */}
          {backdropPath && (
            <div className="absolute inset-0">
              <img
                src={backdropPath}
                alt={title || 'Loading'}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            </div>
          )}

          {/* Contenido centrado */}
          <div className="relative z-10 flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-6">
              {logoPath && (
                <div className="max-w-xs w-full px-8">
                  <img
                    src={logoPath}
                    alt={title || 'Loading'}
                    className="w-full h-auto"
                  />
                </div>
              )}
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}// 2025-12-26 10:02:59
