// Configuración de fuentes de torrents adicionales
export interface TorrentSource {
  name: string;
  baseUrl: string;
  searchPath: string;
  enabled: boolean;
}

// APIs adicionales de torrents para complementar Torrentio
export const ADDITIONAL_TORRENT_SOURCES: TorrentSource[] = [
  {
    name: '1337x',
    baseUrl: 'https://1337x.to',
    searchPath: '/search/{query}/1/',
    enabled: true
  },
  {
    name: 'ThePirateBay',
    baseUrl: 'https://thepiratebay.org',
    searchPath: '/search/{query}/0/99/0',
    enabled: true
  },
  {
    name: 'RARBG',
    baseUrl: 'https://rarbgprx.org',
    searchPath: '/torrents.php?search={query}',
    enabled: true
  },
  {
    name: 'LimeTorrents',
    baseUrl: 'https://limetorrents.lol',
    searchPath: '/search/all/{query}/',
    enabled: true
  },
  {
    name: 'TorrentGalaxy',
    baseUrl: 'https://torrentgalaxy.to',
    searchPath: '/torrents-search.php?search={query}',
    enabled: true
  }
];

// Configuración optimizada de Torrentio para máxima cantidad de torrents incluyendo anime
export const TORRENTIO_CONFIG = {
  // Todos los proveedores disponibles (anime sources prioritized)
  providers: [
    // Fuentes principales
    'yts', 'eztv', 'rarbg', '1337x', 'thepiratebay', 'kickasstorrents',
    'torrentgalaxy', 'magnetdl',
    // Fuentes de anime (prioritarias)
    'nyaasi', 'horriblesubs', 'anidex', 'tokyotosho',
    // Fuentes adicionales
    'rutor', 'rutracker', 'comando', 'bludv', 'torrent9',
    'ilcorsaronero', 'mejortorrent', 'wolfmax4k', 'cinecalidad', 'besttorrents'
  ].join(','),
  
  // Ordenar por calidad y tamaño
  sort: 'qualitysize',
  
  // SIN filtros de calidad para obtener máximos resultados
  // qualityFilter: '', // Removido para obtener todas las calidades
  
  // Configuración completa optimizada
  getConfigString(): string {
    return `providers=${this.providers}|sort=${this.sort}`;
  },
  
  // URL base de Torrentio
  baseUrl: 'https://torrentio.strem.fun'
};

// Función para construir URL de búsqueda de Torrentio
export function buildTorrentioUrl(imdbId: string, type: 'movie' | 'series', season?: number, episode?: number): string {
  const config = TORRENTIO_CONFIG.getConfigString();
  const baseUrl = TORRENTIO_CONFIG.baseUrl;
  
  if (type === 'movie') {
    return `${baseUrl}/${config}/stream/movie/${imdbId}.json`;
  } else {
    if (!season || !episode) {
      throw new Error('Season and episode required for series');
    }
    return `${baseUrl}/${config}/stream/series/${imdbId}:${season}:${episode}.json`;
  }
}

// Función para filtrar episodios individuales
export function filterIndividualEpisodes(streams: any[], season: number, episode: number): any[] {
  return streams.filter(stream => {
    const title = stream.title || stream.name || '';
    
    // Excluir packs de temporadas
    const isSeasonPack = /season|complete|s\d+-s\d+|temporada|pack/i.test(title);
    
    // Incluir solo si contiene el episodio específico
    const episodePatterns = [
      new RegExp(`s0?${season}e0?${episode}\\b`, 'i'),  // S05E10, S5E10
      new RegExp(`${season}x0?${episode}\\b`, 'i'),     // 5x10
      new RegExp(`s0?${season}\\.e0?${episode}\\b`, 'i'), // S05.E10
      new RegExp(`season\\s*0?${season}.*episode\\s*0?${episode}\\b`, 'i') // Season 5 Episode 10
    ];
    
    const hasEpisode = episodePatterns.some(pattern => pattern.test(title));
    
    return !isSeasonPack && hasEpisode;
  });
}

// Función para extraer información de calidad del título
export function extractQuality(title: string): string {
  const qualityMatch = title.match(/\b(2160p|1080p|720p|480p|360p|4K|UHD|HD|SD)\b/i);
  return qualityMatch ? qualityMatch[1].toUpperCase() : 'Unknown';
}

// Función para extraer tamaño del título
export function extractSize(title: string): string {
  const sizeMatch = title.match(/\b(\d+(?:\.\d+)?)\s*(GB|MB|TB)\b/i);
  return sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : 'Unknown';
}

// Función para extraer número de seeds/peers del título
export function extractSeeds(title: string): number {
  const seedsMatch = title.match(/👤\s*(\d+)/);
  return seedsMatch ? parseInt(seedsMatch[1]) : 0;
}

// Función para eliminar torrents duplicados
export function removeDuplicateTorrents(torrents: any[]): any[] {
  const seen = new Map<string, boolean>();
  const unique: any[] = [];
  
  for (const torrent of torrents) {
    // Normalizar título para comparación
    const normalizedTitle = torrent.title
      .toLowerCase()
      .replace(/[\[\]()]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
    
    // Extraer información clave
    const quality = torrent.quality || extractQuality(torrent.title);
    const size = torrent.size || extractSize(torrent.title);
    const episode = torrent.title.match(/[SE]\d+[EX]\d+/i)?.[0] || '';
    
    // Crear clave única basada en contenido principal (primeras 40 chars + calidad + episodio)
    const key = `${normalizedTitle.substring(0, 40)}_${quality}_${episode}`;
    
    if (!seen.has(key)) {
      seen.set(key, true);
      unique.push(torrent);
    } else {
      // Si ya existe, mantener el que tenga más seeds o mejor fuente
      const existingIndex = unique.findIndex((t: any) => {
        const existingNormalized = t.title
          .toLowerCase()
          .replace(/[\[\]()]/g, '')
          .replace(/\s+/g, ' ')
          .replace(/[^\w\s]/g, '')
          .trim();
        const existingKey = `${existingNormalized.substring(0, 40)}_${t.quality || extractQuality(t.title)}_${t.title.match(/[SE]\d+[EX]\d+/i)?.[0] || ''}`;
        return existingKey === key;
      });
      
      if (existingIndex !== -1) {
        const existing = unique[existingIndex];
        const currentSeeds = torrent.seeds || 0;
        const existingSeeds = existing.seeds || 0;
        
        // Priorizar Torrentio y fuentes con más seeds
        const shouldReplace = 
          (torrent.source === 'torrentio' && existing.source !== 'torrentio') ||
          (torrent.source === existing.source && currentSeeds > existingSeeds);
        
        if (shouldReplace) {
          unique[existingIndex] = torrent;
        }
      }
    }
  }
  
  return unique;
}