import { useState, useCallback } from 'react';
import { buildTorrentioUrl, removeDuplicateTorrents, extractQuality, extractSize, extractSeeds } from '@/lib/torrent-sources';
import { getYTSMovieByIMDB, getMagnetLink } from '@/lib/yts';
import { torrentLogger, logger } from '@/lib/logger';

interface TorrentStream {
  title: string;
  infoHash: string;
  magnetUri: string;
  quality?: string;
  size?: string;
  seeds?: number;
  source: string;
}

interface UseTorrentSearchOptions {
  onError?: (error: string) => void;
}

export function useTorrentSearch({ onError }: UseTorrentSearchOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [torrents, setTorrents] = useState<TorrentStream[]>([]);

  const handleError = useCallback((message: string) => {
    logger.error('❌ [TORRENT-SEARCH]', message);
    if (onError) onError(message);
  }, [onError]);

  // Función auxiliar para buscar torrents por título usando Torrentio
  const searchTorrentsByTitle = useCallback(async (
    title: string,
    year?: number,
    season?: number,
    episode?: number
  ): Promise<TorrentStream[]> => {
    try {
      // Construir query de búsqueda
      let searchQuery = title;
      if (year) {
        searchQuery += ` ${year}`;
      }
      if (season && episode) {
        searchQuery += ` S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`;
      }

      torrentLogger.log(`🔍 Buscando torrents por título: "${searchQuery}"`);

      // Usar una API de búsqueda de torrents alternativa (simulando búsqueda por título)
      // En un caso real, aquí usarías APIs como 1337x, ThePirateBay, etc.
      // Por ahora, retornamos un array vacío pero con la estructura preparada
      
      torrentLogger.warn('⚠️ Búsqueda por título no implementada completamente - se requiere IMDb ID');
      return [];

    } catch (error) {
      logger.error('❌ [TORRENT] Error buscando por título:', error);
      return [];
    }
  }, []);

  // Buscar torrents para una película (usando YTS + Torrentio como backup)
  const searchMovieTorrents = useCallback(async (imdbId?: string, fallbackTitle?: string, fallbackYear?: number) => {
    setIsLoading(true);
    setTorrents([]);

    try {
      // Si no hay IMDb ID, intentar búsqueda por título
      if (!imdbId && fallbackTitle) {
        torrentLogger.log('⚠️ Sin IMDb ID, intentando búsqueda por título:', fallbackTitle);
        const titleTorrents = await searchTorrentsByTitle(fallbackTitle, fallbackYear);
        setTorrents(titleTorrents);
        return titleTorrents;
      }

      if (!imdbId) {
        throw new Error('Se requiere IMDb ID o título para buscar torrents');
      }

      torrentLogger.log('Buscando torrents YTS para película:', imdbId);

      const ytsMovie = await getYTSMovieByIMDB(imdbId);
      let ytsTorrents: TorrentStream[] = [];

      if (ytsMovie && ytsMovie.torrents && ytsMovie.torrents.length > 0) {
        // Convertir torrents de YTS al formato esperado y FILTRAR los que tienen 0 seeds
        ytsTorrents = ytsMovie.torrents
          .filter((torrent) => (torrent.seeds || 0) > 0) // ❌ Filtrar 0 seeds
          .map((torrent) => ({
            title: `${ytsMovie.title} (${ytsMovie.year}) - ${torrent.quality} ${torrent.type}`,
            infoHash: torrent.hash,
            magnetUri: getMagnetLink(torrent.hash, ytsMovie.title),
            quality: torrent.quality,
            size: torrent.size,
            seeds: torrent.seeds,
            source: 'YTS'
          }));
        
        torrentLogger.log(`✅ ${ytsTorrents.length} torrents YTS encontrados (con seeds > 0)`);
      }

      // Verificar si necesitamos buscar en Torrentio como backup
      const bestYTSSeeds = Math.max(...ytsTorrents.map(t => t.seeds || 0), 0);
      
      // Agrupar torrents YTS por calidad para verificar opciones
      const ytsByQuality = ytsTorrents.reduce((acc, t) => {
        const quality = t.quality || 'unknown';
        if (!acc[quality]) acc[quality] = [];
        acc[quality].push(t);
        return acc;
      }, {} as Record<string, TorrentStream[]>);
      
      // Verificar si alguna calidad tiene solo 1 opción
      const hasSingleOptionQualities = Object.values(ytsByQuality).some(
        torrents => torrents.length === 1
      );
      
      const needsTorrentioBackup = 
        ytsTorrents.length === 0 || 
        bestYTSSeeds < 5 || 
        hasSingleOptionQualities;

      let torrentioTorrents: TorrentStream[] = [];

      if (needsTorrentioBackup) {
        const reason = ytsTorrents.length === 0 
          ? 'No hay torrents YTS' 
          : bestYTSSeeds < 5 
            ? `Seeds insuficientes (${bestYTSSeeds})` 
            : 'Calidades con 1 sola opción';
        torrentLogger.log(`🔄 ${reason}, buscando en Torrentio como backup...`);
        
        try {
          const url = buildTorrentioUrl(imdbId, 'movie');
          torrentLogger.log('📡 URL Torrentio:', url);

          const response = await fetch(url);

          if (response.ok) {
            const data = await response.json();

            if (data.streams && data.streams.length > 0) {
              // Procesar torrents de Torrentio
              torrentioTorrents = data.streams
                .map((stream: any) => {
                  let infoHash = stream.infoHash || '';
                  
                  if (!infoHash && stream.url) {
                    const hashMatch = stream.url.match(/btih:([a-zA-Z0-9]+)/i);
                    if (hashMatch) infoHash = hashMatch[1];
                  }

                  const magnetUri = infoHash 
                    ? `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(stream.title || 'torrent')}`
                    : stream.url || '';

                  return {
                    title: stream.title || stream.name || 'Unknown',
                    infoHash,
                    magnetUri,
                    quality: extractQuality(stream.title || ''),
                    size: extractSize(stream.title || ''),
                    seeds: extractSeeds(stream.title || ''),
                    source: 'Torrentio',
                  };
                })
                .filter((torrent: TorrentStream) => (torrent.seeds || 0) > 0); // ❌ Filtrar 0 seeds

              torrentLogger.log(`✅ ${torrentioTorrents.length} torrents Torrentio encontrados (backup)`);
            }
          }
        } catch (torrentioError) {
          torrentLogger.warn('⚠️ Error al buscar en Torrentio (backup):', torrentioError);
        }
      }

      // Combinar torrents: YTS primero, luego Torrentio
      const allTorrents = [...ytsTorrents, ...torrentioTorrents];

      if (allTorrents.length === 0) {
        torrentLogger.warn('⚠️ No se encontraron torrents con seeds suficientes');
        setTorrents([]);
        return [];
      }

      // Remover duplicados por infoHash
      const uniqueTorrents = removeDuplicateTorrents(allTorrents);

      // Ordenar por calidad y seeds
      const sortedTorrents = uniqueTorrents.sort((a, b) => {
        const qualityOrder = ['2160p', '1080p', '720p', '480p', '360p'];
        const aQuality = qualityOrder.indexOf(a.quality || '');
        const bQuality = qualityOrder.indexOf(b.quality || '');
        
        if (aQuality !== -1 && bQuality !== -1 && aQuality !== bQuality) {
          return aQuality - bQuality;
        }

        return (b.seeds || 0) - (a.seeds || 0);
      });

      torrentLogger.log(`✅ Total: ${sortedTorrents.length} torrents disponibles (${ytsTorrents.length} YTS + ${torrentioTorrents.length} Torrentio)`);
      setTorrents(sortedTorrents);
      return sortedTorrents;

    } catch (error) {
      logger.error('❌ [TORRENT] Error buscando torrents:', error);
      handleError('Error al buscar torrents');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [handleError]);

  // Buscar torrents para series/anime (usando Torrentio)
  const searchSeriesTorrents = useCallback(async (
    imdbId: string | undefined,
    season: number,
    episode: number,
    fallbackTitle?: string,
    fallbackYear?: number
  ) => {
    setIsLoading(true);
    setTorrents([]);

    try {
      // Si no hay IMDb ID, intentar búsqueda por título
      if (!imdbId && fallbackTitle) {
        torrentLogger.log(`⚠️ Sin IMDb ID, intentando búsqueda por título: ${fallbackTitle} S${season}E${episode}`);
        const titleTorrents = await searchTorrentsByTitle(fallbackTitle, fallbackYear, season, episode);
        setTorrents(titleTorrents);
        return titleTorrents;
      }

      if (!imdbId) {
        throw new Error('Se requiere IMDb ID o título para buscar torrents');
      }

      torrentLogger.log(`Buscando torrents Torrentio para serie: ${imdbId} S${season}E${episode}`);

      const url = buildTorrentioUrl(imdbId, 'series', season, episode);
      torrentLogger.log('📡 URL Torrentio:', url);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const data = await response.json();

      if (!data.streams || data.streams.length === 0) {
        torrentLogger.warn('⚠️ No se encontraron torrents en Torrentio');
        setTorrents([]);
        return [];
      }

      // Procesar y normalizar streams, filtrando los que tienen 0 seeds
      const processedTorrents: TorrentStream[] = data.streams
        .map((stream: any) => {
          let infoHash = stream.infoHash || '';
          
          if (!infoHash && stream.url) {
            const hashMatch = stream.url.match(/btih:([a-zA-Z0-9]+)/i);
            if (hashMatch) infoHash = hashMatch[1];
          }

          const magnetUri = infoHash 
            ? `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(stream.title || 'torrent')}`
            : stream.url || '';

          return {
            title: stream.title || stream.name || 'Unknown',
            infoHash,
            magnetUri,
            quality: extractQuality(stream.title || ''),
            size: extractSize(stream.title || ''),
            seeds: extractSeeds(stream.title || ''),
            source: 'Torrentio',
          };
        })
        .filter((torrent: TorrentStream) => (torrent.seeds || 0) > 0); // ❌ Filtrar 0 seeds

      const uniqueTorrents = removeDuplicateTorrents(processedTorrents);

      // Ordenar por calidad y seeds
      const sortedTorrents = uniqueTorrents.sort((a, b) => {
        const qualityOrder = ['2160p', '1080p', '720p', '480p', '360p'];
        const aQuality = qualityOrder.indexOf(a.quality || '');
        const bQuality = qualityOrder.indexOf(b.quality || '');
        
        if (aQuality !== -1 && bQuality !== -1 && aQuality !== bQuality) {
          return aQuality - bQuality;
        }

        return (b.seeds || 0) - (a.seeds || 0);
      });

      torrentLogger.log(`✅ ${sortedTorrents.length} torrents Torrentio encontrados`);
      setTorrents(sortedTorrents);
      return sortedTorrents;

    } catch (error) {
      logger.error('❌ [TORRENT] Error buscando en Torrentio:', error);
      handleError('Error al buscar torrents en Torrentio');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [handleError]);

  return {
    isLoading,
    torrents,
    searchMovieTorrents,
    searchSeriesTorrents,
    searchTorrentsByTitle,
  };
}
