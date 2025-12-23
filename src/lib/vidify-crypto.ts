/**
 * Módulo para interactuar con la API de Vidify
 * Incluye desencriptación y obtención de streams
 */

// ===== CONSTANTES =====
export const VIDIFY_API = "https://apiv2.vidify.top/api";
export const VIDIFY_KEY = "HpobLp2wBesBkA8rU9HJQcYTBxdrs8X1";
export const VIDIFY_TOKEN = "1212";

// ===== TIPOS =====
export interface VidifyServer {
  name: string;
  sr: number | number[];
  flag: string;
  language: string;
  subtitle: string;
  quality: string;
}

export interface VidifyStreamResult {
  server: string;
  sr: number;
  url: string;
  flag: string;
  language: string;
  subtitle: string;
  quality: string;
}

export interface VidifyDecryptedData {
  url?: string;
  streaming_url?: string;
  stream_url?: string;
  video_url?: string;
  m3u8?: string;
  sources?: Array<{
    url: string;
    originalUrl?: string;
    [key: string]: any;
  }>;
  streams?: Array<{
    url: string;
    [key: string]: any;
  }>;
  [key: string]: any;
}

// ===== SERVIDORES DISPONIBLES =====
export const VIDIFY_SERVERS: VidifyServer[] = [
  // Original Lang
  { name: "Adam", sr: 44, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "Fast" },
  { name: "Alok", sr: 44, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "" },
  { name: "Alto", sr: 44, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "" },
  { name: "Box", sr: 44, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "" },
  { name: "Cypher", sr: 44, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "" },
  { name: "Haxo", sr: 44, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "" },
  { name: "Lux", sr: 44, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "" },
  { name: "Mbox", sr: 44, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "" },
  { name: "Meta", sr: 44, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "" },
  { name: "Nitro", sr: 44, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "" },
  { name: "Prime", sr: 44, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "" },
  { name: "Veasy", sr: 44, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "" },
  { name: "Vplus", sr: 18, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "Fast" },
  { name: "Yoru", sr: 44, flag: "🇺🇸", language: "original Lang", subtitle: "Original audio", quality: "" },
  
  // English Dub
  { name: "Test", sr: 28, flag: "🇺🇸", language: "English Dub", subtitle: "English Dub", quality: "Fast" },
  { name: "Vfast", sr: 11, flag: "🇺🇸", language: "English Dub", subtitle: "English Dub", quality: "" },
  
  // Latin Dub
  { name: "Gekko", sr: 37, flag: "🇻🇦", language: "LATIN Dub", subtitle: "Latin Dub", quality: "" },
];

// Idiomas permitidos
export const ALLOWED_LANGUAGES = ['original Lang', 'English Dub', 'LATIN Dub'];

// ===== FUNCIONES DE DESENCRIPTACIÓN =====

function stringToUint8Array(str: string): Uint8Array {
  return new Uint8Array([...str].map(char => char.charCodeAt(0)));
}

async function decryptBinary(encryptedBinary: string): Promise<Uint8Array> {
  const keyBytes = stringToUint8Array(VIDIFY_KEY);
  
  // Convertir string binario a bytes
  const bytes = encryptedBinary
    .split(' ')
    .map(bin => parseInt(bin, 2))
    .map((byte, idx) => byte ^ keyBytes[idx % keyBytes.length]);
  
  return new Uint8Array(bytes);
}

async function deriveKey(password: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  // Importar la password como key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    password as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  // Derivar la key AES
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-512'
    },
    keyMaterial,
    {
      name: 'AES-CBC',
      length: 256
    },
    false,
    ['decrypt']
  );
}

async function decryptAES(key: CryptoKey, iv: Uint8Array, encryptedData: Uint8Array): Promise<Uint8Array> {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-CBC',
      iv: iv as BufferSource
    },
    key,
    encryptedData as BufferSource
  );
  
  return new Uint8Array(decrypted);
}

function removePadding(data: Uint8Array): Uint8Array {
  const paddingLength = data[data.length - 1];
  return data.slice(0, data.length - paddingLength);
}

export async function decryptSnoopdog(snoopdog: string): Promise<VidifyDecryptedData | null> {
  try {
    // 1. Desencriptar el binario XOR
    const decryptedBytes = await decryptBinary(snoopdog);
    
    // 2. Extraer componentes
    const password = decryptedBytes.slice(0, 32);
    const salt = decryptedBytes.slice(32, 48);
    const iv = decryptedBytes.slice(48, 64);
    const encryptedPayload = decryptedBytes.slice(64);
    
    // 3. Derivar key AES
    const aesKey = await deriveKey(password, salt);
    
    // 4. Desencriptar payload
    const decryptedPayload = await decryptAES(aesKey, iv, encryptedPayload);
    
    // 5. Remover padding PKCS7
    const unpaddedPayload = removePadding(decryptedPayload);
    
    // 6. Convertir a JSON
    const jsonString = new TextDecoder().decode(unpaddedPayload);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error(`[Vidify] Error desencriptando:`, error);
    return null;
  }
}

// ===== FUNCIÓN PARA EXTRAER URL DEL RESPONSE DESENCRIPTADO =====
export function extractUrl(decodedData: VidifyDecryptedData | null): string | null {
  if (!decodedData) return null;
  
  let url: string | null = null;
  
  // Intentar diferentes campos en orden de prioridad
  if (decodedData.streaming_url && typeof decodedData.streaming_url === 'string') {
    url = decodedData.streaming_url;
  } else if (decodedData.stream_url && typeof decodedData.stream_url === 'string') {
    url = decodedData.stream_url;
  } else if (decodedData.video_url && typeof decodedData.video_url === 'string') {
    url = decodedData.video_url;
  } else if (decodedData.url && typeof decodedData.url === 'string' && decodedData.url.includes('http')) {
    url = decodedData.url;
  } else if (decodedData.sources && Array.isArray(decodedData.sources) && decodedData.sources.length > 0) {
    const source = decodedData.sources.find(s => typeof s.url === 'string' && s.url.includes('http'));
    if (source) {
      url = source.url;
      
      // Si hay originalUrl, usar ese (sin proxy)
      if (source.originalUrl && typeof source.originalUrl === 'string') {
        url = source.originalUrl;
      }
    }
  } else if (decodedData.m3u8 && typeof decodedData.m3u8 === 'string') {
    url = decodedData.m3u8;
  } else if (decodedData.streams && Array.isArray(decodedData.streams)) {
    const stream = decodedData.streams.find(s => typeof s.url === 'string' && s.url.includes('http'));
    if (stream) url = stream.url;
  }
  
  // Si la URL es un proxy de vidify o worker, extraer la URL original
  if (url && (url.includes('proxify.vidify.top/proxy') || url.includes('proxy-worker') || url.includes('workers.dev/proxy'))) {
    try {
      const urlObj = new URL(url);
      const originalUrl = urlObj.searchParams.get('url');
      if (originalUrl) {
        url = decodeURIComponent(originalUrl);
      }
    } catch (e) {
      // Si falla el parseo, usar la URL original
    }
  }
  
  // Excluir .mp4 (dan Access Denied)
  if (url && /\.mp4(\?|$)/i.test(url)) {
    return null;
  }
  
  return url;
}

// ===== FUNCIÓN PARA OBTENER STREAM DE UN SERVIDOR =====
export async function fetchVidifyStream(
  tmdbId: string,
  serverConfig: VidifyServer,
  type: 'movie' | 'tv' = 'tv',
  season?: number,
  episode?: number
): Promise<VidifyStreamResult | null> {
  const srValues = Array.isArray(serverConfig.sr) ? serverConfig.sr : [serverConfig.sr];
  
  for (const sr of srValues) {
    try {
      const body: any = {
        tmdb_id: tmdbId,
        sr: sr,
        type: type
      };
      
      if (type === 'tv' && season !== undefined && episode !== undefined) {
        body.season = season;
        body.episode = episode;
      }
      
      // Token va como query parameter
      const apiUrl = `${VIDIFY_API}?token=${VIDIFY_TOKEN}`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://player.vidify.top',
          'Referer': 'https://player.vidify.top/'
        },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        continue;
      }
      
      const data = await response.json();
      
      if (!data.snoopdog) {
        continue;
      }
      
      // Desencriptar
      const decrypted = await decryptSnoopdog(data.snoopdog);
      
      if (!decrypted) {
        continue;
      }
      
      // Extraer URL
      const url = extractUrl(decrypted);
      
      // FILTRO: Saltear URLs con IP directa (tienen certificados SSL rotos)
      if (url) {
        // Detectar si la URL empieza con una IP (ej: https://185.237.107.185/)
        const ipRegex = /^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
        if (ipRegex.test(url)) {
          console.log(`⚠️ [VIDIFY] Salteando ${serverConfig.name} (URL con IP, certificado SSL roto): ${url.substring(0, 50)}...`);
          continue; // Saltear este servidor y probar el siguiente sr
        }
        
        return {
          server: serverConfig.name,
          sr,
          url,
          flag: serverConfig.flag,
          language: serverConfig.language,
          subtitle: serverConfig.subtitle,
          quality: serverConfig.quality
        };
      }
    } catch (error) {
      console.error(`[Vidify] Error fetching ${serverConfig.name}:`, error);
    }
  }
  
  return null;
}

// ===== FUNCIÓN PARA OBTENER TODOS LOS STREAMS DISPONIBLES =====
export async function fetchAllVidifyStreams(
  tmdbId: string,
  type: 'movie' | 'tv' = 'tv',
  season?: number,
  episode?: number,
  excludeLatino: boolean = false
): Promise<VidifyStreamResult[]> {
  // OPTIMIZACIÓN PARA ESCALA: Usar el PRIMER servidor que responda por idioma
  // No hacer scoring - priorizar velocidad sobre calidad
  
  let languagesToFetch = ALLOWED_LANGUAGES;
  if (excludeLatino) {
    // Excluir "LATIN Dub" si viene de Cuevana
    languagesToFetch = ALLOWED_LANGUAGES.filter(lang => lang !== 'LATIN Dub');
    console.log('🚫 [VIDIFY-CRYPTO] Latino excluido - usando Cuevana');
  }
  
  const serversToFetch = VIDIFY_SERVERS.filter(s => languagesToFetch.includes(s.language));
  
  // Agrupar por idioma
  const byLanguage: { [key: string]: typeof serversToFetch } = {};
  serversToFetch.forEach(server => {
    if (!byLanguage[server.language]) {
      byLanguage[server.language] = [];
    }
    byLanguage[server.language].push(server);
  });
  
  // Para cada idioma, hacer race - el primero que responda gana
  const racePromises = Object.entries(byLanguage).map(async ([language, servers]) => {
    try {
      // 🎯 PRIORIDAD ESPECIAL: Para "Original Lang", intentar Adam primero
      if (language === 'Original Lang') {
        const adamServer = servers.find(s => s.name === 'Adam');
        if (adamServer) {
          console.log(`🎯 [VIDIFY-ADAM] Probando Adam primero para ${language}...`);
          const adamResult = await fetchVidifyStream(tmdbId, adamServer, type, season, episode);
          if (adamResult !== null) {
            console.log(`✅ [VIDIFY-ADAM] Adam respondió correctamente para ${language}`);
            return adamResult;
          }
          console.log(`⚠️ [VIDIFY-ADAM] Adam falló, probando otros servidores...`);
        }
      }
      
      // Promise.any - el primero que resuelva (no-null) gana
      const result = await Promise.any(
        servers.map(async (server) => {
          const res = await fetchVidifyStream(tmdbId, server, type, season, episode);
          if (res === null) {
            throw new Error(`${server.name} failed`);
          }
          return res;
        })
      );
      
      console.log(`⚡ [VIDIFY-FAST] ${language}: ${result.server} (primer servidor que respondió)`);
      return result;
    } catch (err) {
      // Todos los servidores fallaron para este idioma
      console.log(`⚠️ [VIDIFY-FAST] ${language}: Ningún servidor respondió`);
      return null;
    }
  });
  
  const results = await Promise.all(racePromises);
  return results.filter((r): r is VidifyStreamResult => r !== null);
}

