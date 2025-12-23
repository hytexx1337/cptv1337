"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import StreamingPlayer from '@/components/streaming/StreamingPlayer';
import { getImageUrl } from '@/lib/tmdb';
import { useDownloadedFiles, DownloadedFile } from '@/hooks/useDownloadedFiles';
import { watchHistory } from '@/lib/watch-history';
import { logger, playerLogger } from '@/lib/logger';
import { TMDBImages } from '@/types/tmdb';

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

        // 🚀 NUEVA ESTRATEGIA:
        // 1. Original → Vidlink (RÁPIDO ~3s o 0.3s con caché) - Iniciar reproducción inmediatamente
        // 2. English Dub + Latino → Vidify (en background) - Se agregan cuando estén listos
        
        // 🎯 PRIORIDAD 1: hls-browser-proxy para Original (RÁPIDO, usa Vidlink internamente)
        logger.log('⚡ [CLIENT-PLAYER] Obteniendo stream Original desde hls-browser-proxy (Vidlink)...');
        try {
          const proxyParams = new URLSearchParams({
            type: normalizedType,
            id: imdbIdLocal || tmdbId.toString(), // Preferir IMDB si existe
          });
          if (isTv && seasonNum && episodeNum) {
            proxyParams.set('season', seasonNum.toString());
            proxyParams.set('episode', episodeNum.toString());
          }
          
          const proxyUrl = `/api/hls-browser-proxy/start?${proxyParams.toString()}`;
          logger.log(`🔗 [CLIENT-PLAYER] Llamando a hls-browser-proxy: ${proxyUrl}`);
          
          const proxyStartTime = Date.now();
          const proxyRes = await fetch(proxyUrl);
          const proxyTime = Date.now() - proxyStartTime;
          
          logger.log(`📡 [CLIENT-PLAYER] hls-browser-proxy respuesta - status: ${proxyRes.status}, tiempo: ${proxyTime}ms`);
          
          if (proxyRes.ok) {
            const proxyData = await proxyRes.json();
            logger.log('📦 [CLIENT-PLAYER] hls-browser-proxy datos:', proxyData);
            
            if (proxyData.playlistUrl) {
              setStreamUrl(proxyData.playlistUrl);
              logger.log(`✅ [CLIENT-PLAYER] Stream Original desde hls-browser-proxy (${proxyTime}ms)${proxyData.cached ? ' [CACHÉ]' : ''} [${proxyData.source}]`);
              
              // Subtítulos (ya vienen proxificados)
              if (proxyData.subtitles && proxyData.subtitles.length > 0) {
                setExternalSubtitles(proxyData.subtitles);
                logger.log(`📝 [CLIENT-PLAYER] ${proxyData.subtitles.length} subtítulos de ${proxyData.source}`);
              }
              
              // 🚀 REPRODUCIR INMEDIATAMENTE - No esperar a los demás
              setLoading(false);
              playerLogger.log(`🎬 [WATCH] Stream Original listo, iniciando reproducción...`);
              
              // 🔄 BACKGROUND: Obtener English Dub y Latino desde Vidify
              (async () => {
                try {
                  logger.log('🌐 [CLIENT-PLAYER] [BACKGROUND] Obteniendo English Dub y Latino desde Vidify...');
                  
                  const vidifyParams = new URLSearchParams({
                    type: normalizedType,
                    id: tmdbId.toString(),
                  });
                  if (isTv && seasonNum && episodeNum) {
                    vidifyParams.set('season', seasonNum.toString());
                    vidifyParams.set('episode', episodeNum.toString());
                  }
                  
                  const vidifyUrl = `/api/streams/vidify-unified?${vidifyParams.toString()}`;
                  const vidifyStartTime = Date.now();
                  const vidifyRes = await fetch(vidifyUrl);
                  const vidifyTime = Date.now() - vidifyStartTime;
                  
                  logger.log(`📡 [CLIENT-PLAYER] [BACKGROUND] Vidify respuesta - status: ${vidifyRes.status}, tiempo: ${vidifyTime}ms`);
                  
                  if (vidifyRes.ok) {
                    const vidifyData = await vidifyRes.json();
                    logger.log('📦 [CLIENT-PLAYER] [BACKGROUND] Vidify datos:', vidifyData);
                    
                    // English Dub
                    if (vidifyData.englishDub?.streamUrl) {
                      const isEnglishOrigin = isFromEnglishSpeakingCountry(localOriginCountries);
                      
                      if (isEnglishOrigin) {
                        logger.log(`🚫 [CLIENT-PLAYER] [BACKGROUND] English Dub omitido (país de habla inglesa: ${localOriginCountries.join(', ')})`);
                      } else {
                        setEnglishDubStreamUrl(vidifyData.englishDub.streamUrl);
                        logger.log(`✅ [CLIENT-PLAYER] [BACKGROUND] English Dub agregado (${vidifyTime}ms)`);
                      }
                    }
                    
                    // Latino
                    if (vidifyData.latino?.streamUrl) {
                      setCustomStreamUrl(vidifyData.latino.streamUrl);
                      logger.log(`✅ [CLIENT-PLAYER] [BACKGROUND] Latino agregado (${vidifyTime}ms)`);
                    }
                  } else {
                    logger.warn(`⚠️ [CLIENT-PLAYER] [BACKGROUND] Vidify falló, solo tendremos Original`);
                  }
                } catch (vidifyErr) {
                  logger.error('❌ [CLIENT-PLAYER] [BACKGROUND] Error con Vidify:', vidifyErr);
                }
              })();
              
              return; // Éxito con hls-browser-proxy, salir
            }
          }
          
          // 🔄 FALLBACK: Vidlink falló, intentar Vidify para TODOS los idiomas (incluye original)
          logger.warn('⚠️ [CLIENT-PLAYER] Vidlink no devolvió stream, intentando Vidify para TODOS los idiomas...');
          
          try {
            const vidifyParams = new URLSearchParams({
              type: normalizedType,
              id: tmdbId.toString(),
              includeOriginal: 'true', // Solicitar original también
            });
            if (isTv && seasonNum && episodeNum) {
              vidifyParams.set('season', seasonNum.toString());
              vidifyParams.set('episode', episodeNum.toString());
            }
            
            const vidifyUrl = `/api/streams/vidify-unified?${vidifyParams.toString()}`;
            const vidifyStartTime = Date.now();
            const vidifyRes = await fetch(vidifyUrl);
            const vidifyTime = Date.now() - vidifyStartTime;
            
            logger.log(`📡 [CLIENT-PLAYER] [FALLBACK] Vidify respuesta - status: ${vidifyRes.status}, tiempo: ${vidifyTime}ms`);
            
            if (vidifyRes.ok) {
              const vidifyData = await vidifyRes.json();
              logger.log('📦 [CLIENT-PLAYER] [FALLBACK] Vidify datos:', vidifyData);
              
              let hasAnyStream = false;
              
              // Original
              if (vidifyData.original?.streamUrl) {
                setStreamUrl(vidifyData.original.streamUrl);
                logger.log(`✅ [CLIENT-PLAYER] [FALLBACK] Stream Original desde Vidify`);
                if (vidifyData.original.subtitles && vidifyData.original.subtitles.length > 0) {
                  setExternalSubtitles(vidifyData.original.subtitles);
                }
                hasAnyStream = true;
              }
              
              // English Dub
              if (vidifyData.englishDub?.streamUrl) {
                const isEnglishOrigin = isFromEnglishSpeakingCountry(localOriginCountries);
                if (!isEnglishOrigin) {
                  setEnglishDubStreamUrl(vidifyData.englishDub.streamUrl);
                  logger.log(`✅ [CLIENT-PLAYER] [FALLBACK] English Dub agregado`);
                  if (!hasAnyStream) hasAnyStream = true;
                }
              }
              
              // Latino
              if (vidifyData.latino?.streamUrl) {
                setCustomStreamUrl(vidifyData.latino.streamUrl);
                logger.log(`✅ [CLIENT-PLAYER] [FALLBACK] Latino agregado`);
                if (!hasAnyStream) hasAnyStream = true;
              }
              
              if (hasAnyStream) {
                setLoading(false);
                playerLogger.log(`🎬 [WATCH] Vidify streams cargados (fallback desde Vidlink)`);
                return; // Éxito con Vidify
              }
            }
            
            logger.warn('⚠️ [CLIENT-PLAYER] Vidify tampoco devolvió streams, fallback a 111movies/GoFile...');
          } catch (vidifyFallbackErr) {
            logger.error('❌ [CLIENT-PLAYER] Error en fallback Vidify:', vidifyFallbackErr);
          }
        } catch (vidlinkErr) {
          logger.error('❌ [CLIENT-PLAYER] Error con Vidlink:', vidlinkErr);
          logger.log('🔄 [CLIENT-PLAYER] Fallback a 111movies/GoFile...');
        }

        // 🔵 PRIORIDAD 2 (FALLBACK): Intentar 111movies
        const params = new URLSearchParams({ type: normalizedType });
        const finalImdbId = imdbIdLocal ?? (imdbId ?? undefined);
        if (!finalImdbId) {
          logger.warn(`No hay IMDb ID disponible para 111movies (tmdbId=${tmdbId}, type=${normalizedType})`);
        } else {
          params.set('id', finalImdbId);
        }
        if (isTv) {
          if (seasonNum) params.set('season', seasonNum.toString());
          if (episodeNum) params.set('episode', episodeNum.toString());
        }

        let startData: any = null;
        if (params.get('id')) {
          logger.log('🌐 [CLIENT-PLAYER] Intentando 111movies primero', {
            params: params.toString(),
          });
          const startRes = await fetch(`/api/hls-browser-proxy/start?${params.toString()}`);
          startData = await startRes.json();
          logger.log('📡 [CLIENT-PLAYER] Respuesta del proxy', {
            ok: startRes.ok,
            hasPlaylistUrl: !!startData?.playlistUrl,
            hasSubtitles: !!startData?.subtitles,
            subtitlesCount: startData?.subtitles?.length || 0,
            error: startData?.error,
          });
          if (startRes.ok && startData?.playlistUrl) {
            logger.log('✅ [CLIENT-PLAYER] Stream exitoso, configurando streamUrl', {
              playlistUrl: startData.playlistUrl,
              source: startData?.source,
            });
            setStreamUrl(startData.playlistUrl);
            
            // Guardar subtítulos si hay
            if (startData.subtitles && startData.subtitles.length > 0) {
              logger.log(`📝 [CLIENT-PLAYER] ${startData.subtitles.length} subtítulos recibidos:`, startData.subtitles);
              setExternalSubtitles(startData.subtitles);
            } else {
              logger.log(`⚠️ [CLIENT-PLAYER] No hay subtítulos en la respuesta`);
            }
            
            playerLogger.log(`🎬 [WATCH] Stream desde ${startData?.source || 'proxy'}: usando playlist local`);
            setLoading(false);
            logger.log('✅ [CLIENT-PLAYER] setLoading(false) - Stream URL configurada');
            
            // ⚠️ DESHABILITADO: Vidify ya devuelve los 3 idiomas (Original, English Dub, Latino)
            // No necesitamos buscar latino por separado con /api/streams/unified
            /*
            // Intentar obtener stream latino en background
            (async () => {
              try {
                logger.log('🌐 [CLIENT-PLAYER] Iniciando búsqueda de stream latino...');
                const unifiedParams = new URLSearchParams({
                  type: normalizedType,
                  id: tmdbId.toString(),
                });
                if (isTv && seasonNum && episodeNum) {
                  unifiedParams.set('season', seasonNum.toString());
                  unifiedParams.set('episode', episodeNum.toString());
                }
                
                const url = `/api/streams/unified?${unifiedParams.toString()}`;
                logger.log(`🔗 [CLIENT-PLAYER] Llamando a: ${url}`);
                
                const unifiedRes = await fetch(url);
                logger.log(`📡 [CLIENT-PLAYER] Respuesta recibida - status: ${unifiedRes.status}`);
                
                if (unifiedRes.ok) {
                  const unifiedData = await unifiedRes.json();
                  logger.log('📦 [CLIENT-PLAYER] Datos recibidos:', unifiedData);
                  
                  if (unifiedData.latino?.streamUrl) {
                    logger.log('✅ [CLIENT-PLAYER] Stream latino encontrado:', unifiedData.latino.streamUrl);
                    setCustomStreamUrl(unifiedData.latino.streamUrl);
                  } else if (!unifiedData.latino?.unavailable) {
                    // Si no está disponible pero tampoco marcado como unavailable, hacer polling
                    logger.log('⏳ [CLIENT-PLAYER] Stream latino no disponible inmediatamente, iniciando polling...');
                    let attempts = 0;
                    const maxAttempts = 30; // 30 intentos = 2.5 minutos
                    
                    const pollInterval = setInterval(async () => {
                      attempts++;
                      if (attempts > maxAttempts) {
                        clearInterval(pollInterval);
                        logger.log('⏱️ [CLIENT-PLAYER] Polling detenido - tiempo máximo alcanzado');
                        return;
                      }
                      
                      try {
                        const pollRes = await fetch(`/api/streams/unified?${unifiedParams.toString()}`);
                        if (pollRes.ok) {
                          const pollData = await pollRes.json();
                          if (pollData.latino?.streamUrl) {
                            logger.log(`✅ [CLIENT-PLAYER] Stream latino encontrado en intento ${attempts}`);
                            setCustomStreamUrl(pollData.latino.streamUrl);
                            clearInterval(pollInterval);
                          } else if (pollData.latino?.unavailable) {
                            logger.log('❌ [CLIENT-PLAYER] Stream latino marcado como unavailable');
                            clearInterval(pollInterval);
                          }
                        }
                      } catch (pollErr) {
                        logger.warn('Error en polling de stream latino:', pollErr);
                      }
                    }, 5000); // Cada 5 segundos
                  }
                } else {
                  logger.warn(`❌ [CLIENT-PLAYER] API respondió con error: ${unifiedRes.status}`);
                }
              } catch (latinoErr) {
                logger.error('❌ [CLIENT-PLAYER] Error al obtener stream latino:', latinoErr);
              }
            })();
            */
            
            return;
          } else {
            logger.warn('111movies falló, intentando GoFile...');
          }
        }

        // PRIORIDAD 2: Verificar si hay archivos GoFile disponibles
        let files: DownloadedFile[] = [];
        try {
          if (isTv && seasonNum && episodeNum) {
            files = await getEpisodeFiles(tmdbId, seasonNum, episodeNum);
          } else {
            files = await getMovieFiles(tmdbId);
          }
        } catch (fileErr) {
          logger.warn('Fallo al obtener archivos descargados:', fileErr);
        }

        if (files.length > 0) {
          const file = files[0];
          logger.log('✅ [CLIENT-PLAYER] Archivo GoFile encontrado', {
            fileName: file.fileName,
            hasGofileUrl: !!file.gofileUrl,
            hasGofileDirectUrl: !!file.gofileDirectUrl,
          });
          setSelectedFile(file);
          setGoFileUrl(file.gofileDirectUrl || file.gofileUrl);
          await updateLastAccessed(file.id).catch(() => {});
          playerLogger.log(`🎬 [WATCH] GoFile: ${file.fileName}`);
          setLoading(false);
          logger.log('✅ [CLIENT-PLAYER] setLoading(false) - GoFile URL configurada');
          
          // Intentar obtener stream latino en background (mismo código que arriba)
          (async () => {
            try {
              logger.log('🌐 [CLIENT-PLAYER] Iniciando búsqueda de stream latino (GoFile)...');
              const unifiedParams = new URLSearchParams({
                type: normalizedType,
                id: tmdbId.toString(),
              });
              if (isTv && seasonNum && episodeNum) {
                unifiedParams.set('season', seasonNum.toString());
                unifiedParams.set('episode', episodeNum.toString());
              }
              
              const url = `/api/streams/unified?${unifiedParams.toString()}`;
              logger.log(`🔗 [CLIENT-PLAYER] Llamando a: ${url}`);
              
              const unifiedRes = await fetch(url);
              logger.log(`📡 [CLIENT-PLAYER] Respuesta recibida - status: ${unifiedRes.status}`);
              
              if (unifiedRes.ok) {
                const unifiedData = await unifiedRes.json();
                logger.log('📦 [CLIENT-PLAYER] Datos recibidos:', unifiedData);
                
                if (unifiedData.latino?.streamUrl) {
                  logger.log('✅ [CLIENT-PLAYER] Stream latino encontrado:', unifiedData.latino.streamUrl);
                  setCustomStreamUrl(unifiedData.latino.streamUrl);
                } else if (!unifiedData.latino?.unavailable) {
                  // Si no está disponible pero tampoco marcado como unavailable, hacer polling
                  logger.log('⏳ [CLIENT-PLAYER] Stream latino no disponible inmediatamente, iniciando polling...');
                  let attempts = 0;
                  const maxAttempts = 30; // 30 intentos = 2.5 minutos
                  
                  const pollInterval = setInterval(async () => {
                    attempts++;
                    if (attempts > maxAttempts) {
                      clearInterval(pollInterval);
                      logger.log('⏱️ [CLIENT-PLAYER] Polling detenido - tiempo máximo alcanzado');
                      return;
                    }
                    
                    try {
                      const pollRes = await fetch(`/api/streams/unified?${unifiedParams.toString()}`);
                      if (pollRes.ok) {
                        const pollData = await pollRes.json();
                        if (pollData.latino?.streamUrl) {
                          logger.log(`✅ [CLIENT-PLAYER] Stream latino encontrado en intento ${attempts}`);
                          setCustomStreamUrl(pollData.latino.streamUrl);
                          clearInterval(pollInterval);
                        } else if (pollData.latino?.unavailable) {
                          logger.log('❌ [CLIENT-PLAYER] Stream latino marcado como unavailable');
                          clearInterval(pollInterval);
                        }
                      }
                    } catch (pollErr) {
                      logger.warn('Error en polling de stream latino:', pollErr);
                    }
                  }, 5000); // Cada 5 segundos
                }
              } else {
                logger.warn(`❌ [CLIENT-PLAYER] API respondió con error: ${unifiedRes.status}`);
              }
            } catch (latinoErr) {
              logger.error('❌ [CLIENT-PLAYER] Error al obtener stream latino:', latinoErr);
            }
          })();
          
          return;
        }

        // PRIORIDAD 3: Error - no hay ninguna fuente disponible
        setError(startData?.error || 'No se encontró ninguna fuente disponible');
        setLoading(false);
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
}