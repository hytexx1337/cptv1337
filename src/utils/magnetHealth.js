// 🔥 UTILIDADES PARA VERIFICAR SALUD DE MAGNET LINKS
// Optimizado para velocidad y precisión

let webtorrentHealth;

// Lazy loading del módulo para evitar errores en el cliente
const loadWebtorrentHealth = async () => {
  if (!webtorrentHealth) {
    try {
      webtorrentHealth = (await import('webtorrent-health')).default;
    } catch (error) {
      console.warn('webtorrent-health no disponible:', error.message);
      return null;
    }
  }
  return webtorrentHealth;
};

// 🚀 VERIFICACIÓN RÁPIDA DE UN MAGNET LINK CON FALLBACK
export async function checkMagnetHealth(magnetUrl, timeout = 15000, fallbackData = null) {
  const healthChecker = await loadWebtorrentHealth();
  
  if (!healthChecker) {
    // Fallback: usar datos del sitio web si están disponibles
    if (fallbackData && fallbackData.seeds !== undefined) {
      return {
        seeds: fallbackData.seeds || 0,
        peers: fallbackData.peers || fallbackData.leeches || 0,
        priority: calculatePriority(fallbackData.seeds || 0),
        status: getStatusFromSeeds(fallbackData.seeds || 0),
        healthy: (fallbackData.seeds || 0) > 0,
        duration: 0,
        source: 'website_fallback'
      };
    }
    
    return {
      seeds: 0,
      peers: 0,
      priority: 0,
      status: 'unknown',
      healthy: false,
      duration: 0,
      source: 'no_data'
    };
  }

  const startTime = Date.now();
  
  try {
    const healthData = await healthChecker(magnetUrl, {
      timeout: timeout,
      announce: [
        // Trackers actualizados al día de hoy (2025)
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://public.demonoid.ch:6969/announce',
        'udp://open.demonoid.ch:6969/announce',
        'udp://open.demonii.com:1337/announce',
        'udp://open-tracker.demonoid.ch:6969/announce',
        'udp://open.stealth.si:80/announce',
        'udp://explodie.org:6969/announce',
        'udp://exodus.desync.com:6969/announce',
        'udp://wepzone.net:6969/announce',
        'udp://udp.tracker.projectk.org:23333/announce',
        'udp://ttk2.nbaonlineservice.com:6969/announce',
        'udp://tracker.zupix.online:6969/announce',
        'udp://tracker.valete.tf:9999/announce',
        'udp://tracker.tryhackx.org:6969/announce',
        'udp://tracker.therarbg.to:6969/announce',
        'udp://tracker.theoks.net:6969/announce',
        'udp://tracker.srv00.com:6969/announce',
        'udp://tracker.skillindia.site:6969/announce',
        'udp://tracker.qu.ax:6969/announce',
        'udp://tracker.plx.im:6969/announce'
      ]
    });
    
    const duration = Date.now() - startTime;
    
    // 🔥 NUEVA LÓGICA: Si webtorrent-health devuelve 0 seeds pero tenemos datos de fallback con seeds, usar fallback
    if ((healthData.seeds || 0) === 0 && fallbackData && (fallbackData.seeds || 0) > 0) {
      console.log(`🔄 webtorrent-health devolvió 0 seeds, usando datos de fallback: ${fallbackData.seeds} seeds`);
      return {
        seeds: fallbackData.seeds || 0,
        peers: fallbackData.peers || fallbackData.leeches || 0,
        priority: calculatePriority(fallbackData.seeds || 0),
        status: getStatusFromSeeds(fallbackData.seeds || 0),
        healthy: (fallbackData.seeds || 0) > 0,
        duration: duration,
        source: 'website_fallback_preferred'
      };
    }
    
    return {
      seeds: healthData.seeds || 0,
      peers: healthData.peers || 0,
      priority: calculatePriority(healthData.seeds || 0),
      status: getStatusFromSeeds(healthData.seeds || 0),
      healthy: (healthData.seeds || 0) > 0,
      duration: duration,
      source: 'webtorrent_health'
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Fallback: usar datos del sitio web si están disponibles
    if (fallbackData && fallbackData.seeds !== undefined) {
      return {
        seeds: fallbackData.seeds || 0,
        peers: fallbackData.peers || fallbackData.leeches || 0,
        priority: calculatePriority(fallbackData.seeds || 0),
        status: getStatusFromSeeds(fallbackData.seeds || 0),
        healthy: (fallbackData.seeds || 0) > 0,
        duration: duration,
        source: 'website_fallback'
      };
    }
    
    return {
      seeds: 0,
      peers: 0,
      priority: 0,
      status: 'error',
      healthy: false,
      duration: duration,
      source: 'error'
    };
  }
}

// Funciones auxiliares para calcular prioridad y status
function calculatePriority(seeds) {
  if (seeds > 100) return 5;
  if (seeds > 50) return 4;
  if (seeds > 20) return 3;
  if (seeds > 5) return 2;
  if (seeds > 0) return 1;
  return 0;
}

function getStatusFromSeeds(seeds) {
  if (seeds > 100) return 'excellent';
  if (seeds > 50) return 'very-good';
  if (seeds > 20) return 'good';
  if (seeds > 5) return 'fair';
  if (seeds > 0) return 'poor';
  return 'dead';
}

// 🔥 VERIFICACIÓN EN PARALELO DE MÚLTIPLES MAGNETS CON FALLBACK
export async function checkMultipleMagnetsHealthWithFallback(torrents, timeout = 15000, fallbackDataArray = []) {
  if (!torrents || torrents.length === 0) {
    return [];
  }

  console.log(`🔍 Verificando salud de ${torrents.length} torrents...`);
  
  const startTime = Date.now();
  
  // Verificar todos en paralelo para máxima velocidad
  const healthPromises = torrents.map(async (torrent, index) => {
    try {
      const fallbackData = fallbackDataArray[index] || null;
      const health = await checkMagnetHealth(torrent.magnetUrl || torrent.magnet, timeout, fallbackData);
      
      return {
        ...torrent,
        health: health,
        healthChecked: true,
        healthTimestamp: Date.now()
      };
    } catch (error) {
      console.warn(`Error verificando torrent ${index}:`, error.message);
      
      // Usar fallback si está disponible
      const fallbackData = fallbackDataArray[index];
      if (fallbackData && fallbackData.seeds !== undefined) {
        return {
          ...torrent,
          health: {
            seeds: fallbackData.seeds || 0,
            peers: fallbackData.peers || fallbackData.leeches || 0,
            priority: calculatePriority(fallbackData.seeds || 0),
            status: getStatusFromSeeds(fallbackData.seeds || 0),
            healthy: (fallbackData.seeds || 0) > 0,
            duration: 0,
            source: 'website_fallback_error'
          },
          healthChecked: true,
          healthTimestamp: Date.now()
        };
      }
      
      return {
        ...torrent,
        health: {
          seeds: 0,
          peers: 0,
          priority: 0,
          status: 'error',
          healthy: false,
          duration: 0,
          source: 'error'
        },
        healthChecked: true,
        healthTimestamp: Date.now()
      };
    }
  });
  
  const results = await Promise.all(healthPromises);
  
  const totalDuration = Date.now() - startTime;
  
  console.log(`✅ Verificación completada en ${totalDuration}ms`);
  console.log(`📊 Promedio: ${Math.round(totalDuration / torrents.length)}ms por torrent`);
  
  // Log de resultados para debugging
  results.forEach((torrent, index) => {
    const h = torrent.health;
    const source = h.source ? ` (${h.source})` : '';
    if (h.seeds > 0) {
      console.log(`${index + 1}. ✅ Torrent - ${h.seeds} seeds (${h.duration}ms)${source}`);
    } else {
      console.log(`${index + 1}. ⚠️ Torrent - ${h.seeds} seeds (${h.duration}ms)${source}`);
    }
  });
  
  return results;
}

// 🔥 VERIFICACIÓN EN PARALELO DE MÚLTIPLES MAGNETS (VERSIÓN ORIGINAL)
export async function checkMultipleMagnetsHealth(torrents, timeout = 15000) {
  if (!torrents || torrents.length === 0) {
    return [];
  }

  console.log(`🔍 Verificando salud de ${torrents.length} torrents...`);
  
  const startTime = Date.now();
  
  // Verificar todos en paralelo para máxima velocidad
  const healthPromises = torrents.map(async (torrent, index) => {
    try {
      const health = await checkMagnetHealth(torrent.magnetUrl || torrent.magnet, timeout);
      
      return {
        ...torrent,
        health: health,
        healthChecked: true,
        healthTimestamp: Date.now()
      };
    } catch (error) {
      console.warn(`Error verificando torrent ${index}:`, error.message);
      
      return {
        ...torrent,
        health: {
          seeds: 0,
          peers: 0,
          priority: 0,
          status: 'error',
          healthy: false,
          duration: 0
        },
        healthChecked: true,
        healthTimestamp: Date.now()
      };
    }
  });
  
  const results = await Promise.all(healthPromises);
  
  const totalDuration = Date.now() - startTime;
  
  console.log(`✅ Verificación completada en ${totalDuration}ms`);
  console.log(`📊 Promedio: ${Math.round(totalDuration / torrents.length)}ms por torrent`);
  
  // Log de resultados para debugging
  results.forEach((torrent, index) => {
    const h = torrent.health;
    console.log(`${index + 1}. ${getHealthEmoji(h.status)} ${torrent.title || 'Torrent'} - ${h.seeds} seeds (${h.duration}ms)`);
  });
  
  return results;
}

// 🎯 ORDENAMIENTO INTELIGENTE CON SALUD
export function sortTorrentsByHealth(torrents) {
  return [...torrents].sort((a, b) => {
    const healthA = a.health || { priority: 0, seeds: 0 };
    const healthB = b.health || { priority: 0, seeds: 0 };
    
    // 1. Priorizar por salud (priority)
    if (healthB.priority !== healthA.priority) {
      return healthB.priority - healthA.priority;
    }
    
    // 2. Si tienen la misma prioridad, ordenar por seeds
    if (healthB.seeds !== healthA.seeds) {
      return healthB.seeds - healthA.seeds;
    }
    
    // 3. Fallback: ordenar por calidad si no hay diferencia en salud
    const qualityOrder = ['2160p', '4K', '1080p', '720p', '480p', '360p'];
    const qualityA = extractQuality(a.title || a.name || '');
    const qualityB = extractQuality(b.title || b.name || '');
    
    const indexA = qualityOrder.indexOf(qualityA);
    const indexB = qualityOrder.indexOf(qualityB);
    
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    
    // 4. Fallback final: por tamaño (más grande primero)
    const sizeA = extractSize(a.title || a.name || '');
    const sizeB = extractSize(b.title || b.name || '');
    
    return sizeB - sizeA;
  });
}

// 🎨 EMOJIS PARA ESTADOS DE SALUD
export function getHealthEmoji(status) {
  const emojis = {
    'excellent': '🔥',
    'very-good': '✅',
    'good': '⚠️',
    'fair': '🟡',
    'poor': '🔴',
    'dead': '❌',
    'error': '⚠️',
    'unknown': '❓'
  };
  
  return emojis[status] || '❓';
}

// 🔧 UTILIDADES AUXILIARES
function extractQuality(title) {
  const qualityMatch = title.match(/(\d{3,4}p|4K|HD|SD)/i);
  return qualityMatch ? qualityMatch[1].toLowerCase() : '';
}

function extractSize(title) {
  const sizeMatch = title.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
  if (!sizeMatch) return 0;
  
  const size = parseFloat(sizeMatch[1]);
  const unit = sizeMatch[2].toUpperCase();
  
  switch (unit) {
    case 'TB': return size * 1024 * 1024;
    case 'GB': return size * 1024;
    case 'MB': return size;
    default: return size;
  }
}

// 🚀 FUNCIÓN PRINCIPAL PARA USAR EN COMPONENTES
export async function enhanceTorrentsWithHealth(torrents, options = {}) {
  const {
    timeout = 15000, // Aumentado a 15 segundos por defecto para mejor detección
    maxConcurrent = 10,
    skipHealthCheck = false
  } = options;
  
  if (skipHealthCheck || !torrents || torrents.length === 0) {
    return torrents;
  }
  
  // Preparar datos de fallback usando seeds/peers de las fuentes originales
  const fallbackDataArray = torrents.map(torrent => ({
    seeds: torrent.seeds || 0,
    peers: torrent.peers || 0,
    leeches: torrent.leeches || 0
  }));
  
  // Limitar concurrencia para evitar saturar la red
  const chunks = [];
  const fallbackChunks = [];
  for (let i = 0; i < torrents.length; i += maxConcurrent) {
    chunks.push(torrents.slice(i, i + maxConcurrent));
    fallbackChunks.push(fallbackDataArray.slice(i, i + maxConcurrent));
  }
  
  let enhancedTorrents = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const fallbackChunk = fallbackChunks[i];
    
    // Usar la función con fallback para mejor detección
    const chunkResults = await checkMultipleMagnetsHealthWithFallback(chunk, timeout, fallbackChunk);
    enhancedTorrents = enhancedTorrents.concat(chunkResults);
    
    // Pequeña pausa entre chunks para no saturar
    if (chunks.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Ordenar por salud
  return sortTorrentsByHealth(enhancedTorrents);
}