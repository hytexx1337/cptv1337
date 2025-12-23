// Cache para evitar verificaciones repetidas
const healthCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Función para cargar WebTorrent en el navegador
async function loadWebTorrent() {
  // Si estamos en Node.js (test), usar require
  if (typeof window === 'undefined') {
    const WebTorrent = require('webtorrent');
    return WebTorrent;
  }
  
  // Si estamos en el navegador, usar una versión específica más estable
  return new Promise((resolve, reject) => {
    if (window.WebTorrent) {
      resolve(window.WebTorrent);
      return;
    }
    
    const script = document.createElement('script');
    // Usar versión específica más estable sin asm.js problemático
    script.src = 'https://cdn.jsdelivr.net/npm/webtorrent@1.9.7/webtorrent.min.js';
    script.onload = () => {
      console.log('🌐 WebTorrent v1.9.7 cargado desde CDN para DHT');
      resolve(window.WebTorrent);
    };
    script.onerror = () => {
      console.error('❌ Error al cargar WebTorrent desde CDN');
      reject(new Error('Failed to load WebTorrent'));
    };
    document.head.appendChild(script);
  });
}

/**
 * Verifica la salud de un magnet usando DHT (más confiable que trackers UDP)
 */
async function checkMagnetHealthDHT(magnetUrl, fallbackData = null, timeout = 8000) {
  const startTime = Date.now();
  
  console.log(`🔍 DHT Check iniciado para: ${magnetUrl.substring(0, 50)}... (timeout: ${timeout}ms)`);
  
  // Verificar cache
  const cacheKey = magnetUrl;
  const cached = healthCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    console.log(`📋 Cache hit para magnet`);
    return { ...cached.data, duration: Date.now() - startTime, source: 'cache' };
  }
  
  // TEMPORAL: Deshabilitar DHT en navegador debido a problemas con asm.js
  // Usar directamente los datos de fallback si están disponibles
  if (typeof window !== 'undefined') {
    console.log(`🌐 DHT deshabilitado en navegador - usando fallback`);
    
    if (fallbackData && (fallbackData.seeds || 0) > 0) {
      console.log(`📊 Usando datos de fallback: ${fallbackData.seeds} seeds`);
      const result = {
        seeds: fallbackData.seeds || 0,
        peers: fallbackData.peers || fallbackData.leeches || 0,
        priority: calculatePriority(fallbackData.seeds || 0),
        status: getStatusFromSeeds(fallbackData.seeds || 0),
        healthy: (fallbackData.seeds || 0) > 0,
        duration: Date.now() - startTime,
        source: 'browser_fallback'
      };
      
      // Guardar en cache
      healthCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      return result;
    } else {
      // Sin fallback, asumir que está muerto
      return {
        seeds: 0,
        peers: 0,
        priority: 0,
        status: 'dead',
        healthy: false,
        duration: Date.now() - startTime,
        source: 'browser_no_fallback'
      };
    }
  }
  
  try {
    // Solo usar DHT en Node.js (tests)
    const WebTorrent = await loadWebTorrent();
    
    return new Promise((resolve) => {
      const client = new WebTorrent({ 
        dht: true,      // Habilitar DHT
        tracker: false, // Deshabilitar trackers UDP problemáticos
        lsd: true,      // Local Service Discovery
        webSeeds: true  // Web seeds
      });
    
    let resolved = false;
    let peerCount = 0;
    let seedCount = 0;
    
    console.log(`🌐 WebTorrent client creado, agregando magnet...`);
    
    const torrent = client.add(magnetUrl, { 
      path: './tmp',
      announce: [] // Sin trackers UDP
    });
    
    // Timeout más agresivo para resolver
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(`⏰ DHT Timeout alcanzado (${timeout}ms) - peers encontrados: ${peerCount}`);
        
        // Si no encontramos peers pero tenemos datos de fallback, usarlos
        if (peerCount === 0 && fallbackData && (fallbackData.seeds || 0) > 0) {
          console.log(`📊 Usando datos de fallback: ${fallbackData.seeds} seeds`);
          const result = {
            seeds: fallbackData.seeds || 0,
            peers: fallbackData.peers || fallbackData.leeches || 0,
            priority: calculatePriority(fallbackData.seeds || 0),
            status: getStatusFromSeeds(fallbackData.seeds || 0),
            healthy: (fallbackData.seeds || 0) > 0,
            duration: Date.now() - startTime,
            source: 'dht_timeout_fallback'
          };
          
          // Guardar en cache
          healthCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
          });
          
          client.destroy();
          resolve(result);
        } else {
          console.log(`💀 DHT Timeout sin peers ni fallback válido`);
          const result = {
            seeds: 0,
            peers: peerCount,
            priority: 0,
            status: 'dead',
            healthy: false,
            duration: Date.now() - startTime,
            source: 'dht_timeout',
            error: `Timeout after ${timeout}ms`
          };
          
          client.destroy();
          resolve(result);
        }
      }
    }, timeout);
    
    // Eventos del torrent
    torrent.on('wire', (wire) => {
      console.log(`🔗 Nueva conexión DHT establecida`);
      peerCount++;
      
      // Resolver más temprano si encontramos peers
      if (peerCount >= 2 && !resolved) { // Reducir de 5 a 2 peers
        resolved = true;
        clearTimeout(timeoutId);
        
        console.log(`✅ DHT resuelto temprano con ${peerCount} peers`);
        
        // Estimar seeds basado en peers (heurística)
        seedCount = Math.max(1, Math.floor(peerCount * 0.3));
        
        const result = {
          seeds: seedCount,
          peers: peerCount,
          priority: calculatePriority(seedCount),
          status: getStatusFromSeeds(seedCount),
          healthy: true,
          duration: Date.now() - startTime,
          source: 'dht_success'
        };
        
        // Guardar en cache
        healthCache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
        
        client.destroy();
        resolve(result);
      }
    });
    
    torrent.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        
        console.log(`❌ Error DHT: ${err.message}`);
        
        // Usar fallback si está disponible
        if (fallbackData && (fallbackData.seeds || 0) > 0) {
          console.log(`📊 Usando fallback tras error: ${fallbackData.seeds} seeds`);
          const result = {
            seeds: fallbackData.seeds || 0,
            peers: fallbackData.peers || fallbackData.leeches || 0,
            priority: calculatePriority(fallbackData.seeds || 0),
            status: getStatusFromSeeds(fallbackData.seeds || 0),
            healthy: (fallbackData.seeds || 0) > 0,
            duration: Date.now() - startTime,
            source: 'dht_error_fallback',
            error: err.message
          };
          
          client.destroy();
          resolve(result);
        } else {
          console.log(`💀 Error DHT sin fallback válido`);
          const result = {
            seeds: 0,
            peers: 0,
            priority: 0,
            status: 'error',
            healthy: false,
            duration: Date.now() - startTime,
            source: 'dht_error',
            error: err.message
          };
          
          client.destroy();
          resolve(result);
        }
      }
    });
    
    // Timeout de seguridad adicional
    setTimeout(() => {
      if (!resolved) {
        console.log(`🚨 Timeout de seguridad activado`);
        client.destroy();
      }
    }, timeout + 2000);
  });
  
  } catch (error) {
    console.error(`❌ Error al cargar WebTorrent: ${error.message}`);
    
    // Si no se puede cargar WebTorrent, usar fallback si está disponible
    if (fallbackData && (fallbackData.seeds || 0) > 0) {
      console.log(`📊 Usando fallback tras error de carga: ${fallbackData.seeds} seeds`);
      return {
        seeds: fallbackData.seeds || 0,
        peers: fallbackData.peers || fallbackData.leeches || 0,
        priority: calculatePriority(fallbackData.seeds || 0),
        status: getStatusFromSeeds(fallbackData.seeds || 0),
        healthy: (fallbackData.seeds || 0) > 0,
        duration: Date.now() - startTime,
        source: 'webtorrent_load_error_fallback',
        error: error.message
      };
    } else {
      return {
        seeds: 0,
        peers: 0,
        priority: 0,
        status: 'error',
        healthy: false,
        duration: Date.now() - startTime,
        source: 'webtorrent_load_error',
        error: error.message
      };
    }
  }
}

/**
 * Verifica múltiples magnets con DHT
 */
async function checkMultipleMagnetsHealthDHT(magnetsWithFallback, concurrency = 3, timeout = 8000) {
  const results = [];
  
  // Procesar en lotes para no sobrecargar
  for (let i = 0; i < magnetsWithFallback.length; i += concurrency) {
    const batch = magnetsWithFallback.slice(i, i + concurrency);
    
    const batchPromises = batch.map(({ magnetUrl, fallbackData }) => 
      checkMagnetHealthDHT(magnetUrl, fallbackData, timeout)
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Pequeña pausa entre lotes
    if (i + concurrency < magnetsWithFallback.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

// Funciones auxiliares
function calculatePriority(seeds) {
  if (seeds >= 50) return 5;
  if (seeds >= 20) return 4;
  if (seeds >= 10) return 3;
  if (seeds >= 5) return 2;
  if (seeds >= 1) return 1;
  return 0;
}

function getStatusFromSeeds(seeds) {
  if (seeds >= 50) return 'excellent';
  if (seeds >= 20) return 'very-good';
  if (seeds >= 10) return 'good';
  if (seeds >= 5) return 'fair';
  if (seeds >= 1) return 'good'; // Cambiar de 'poor' a 'good' para torrents con al menos 1 seed
  return 'dead';
}

module.exports = {
  checkMagnetHealthDHT,
  checkMultipleMagnetsHealthDHT
};