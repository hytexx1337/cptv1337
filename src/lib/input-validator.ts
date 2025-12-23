/**
 * 🔒 VALIDADORES DE INPUT - Protección contra inyección
 */

// Protocolos permitidos para URLs
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

// IPs privadas y localhost (bloquear SSRF)
const BLOCKED_IPS = [
  '127.0.0.1',
  'localhost',
  '::1',
  '0.0.0.0',
];

const BLOCKED_IP_RANGES = [
  /^10\./,                    // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
  /^192\.168\./,              // 192.168.0.0/16
  /^169\.254\./,              // 169.254.0.0/16 (link-local)
  /^fd[0-9a-f]{2}:/i,         // IPv6 ULA
  /^fe80:/i,                  // IPv6 link-local
];

// Dominios permitidos para recursos NO-streaming (whitelist estricto)
// ⚠️ Los CDNs de streaming NO necesitan estar aquí (se permiten automáticamente)
const ALLOWED_DOMAINS = [
  // Servicios de scraping
  '111movies.com',
  'megafiles.store',
  'vidlink.pro',
  'cuevana.biz',
  
  // APIs y recursos estáticos
  'image.tmdb.org',
  'api.themoviedb.org',
  'www.youtube.com',
  'youtube.com',
  'i.ytimg.com',
  'yts.mx',
  'img.yts.mx',
  'cdn.myanimelist.net',
  'opensubtitles.com',
  'api.opensubtitles.com',
  'subdivx.com',
  
  // ⚠️ NOTA: Los CDNs de streaming (videok.pro, xenolyzb.com, habetar.com, 
  // horizonpathventures.sbs, etc) ya NO necesitan estar en esta lista porque 
  // se permiten automáticamente mediante las excepciones de streaming:
  // - Paths: /stream/, /hls/, /vod/, /cdn/, /media/, /video/, /manifest/
  // - Extensiones: .m3u8, .txt, .ts, .mp4, .webm, .aac, .woff2, etc
  // - Subdominios: cdn., stream., video., media., content., player., cache.
  // - Parámetros: playlist, manifest, segment, chunk, quality, bitrate
];

/**
 * Validar ID de contenido (TMDB, etc.)
 */
export function validateId(id: unknown): string {
  if (typeof id !== 'string') {
    throw new Error('ID must be a string');
  }
  
  // Solo alfanuméricos, guiones y guiones bajos, máximo 50 caracteres
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(id)) {
    throw new Error('Invalid ID format');
  }
  
  return id;
}

/**
 * Validar URL y prevenir SSRF
 */
export function validateUrl(url: unknown, allowPrivate = false): string {
  if (typeof url !== 'string') {
    throw new Error('URL must be a string');
  }
  
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }
  
  // Validar protocolo
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    throw new Error(`Protocol not allowed: ${parsed.protocol}`);
  }
  
  // Prevenir SSRF (a menos que esté explícitamente permitido)
  if (!allowPrivate) {
    const hostname = parsed.hostname.toLowerCase();
    
    // Bloquear localhost y IPs privadas
    if (BLOCKED_IPS.includes(hostname)) {
      throw new Error('Access to localhost/private IPs is blocked');
    }
    
    // Bloquear rangos de IP privadas
    for (const range of BLOCKED_IP_RANGES) {
      if (range.test(hostname)) {
        throw new Error('Access to private IP ranges is blocked');
      }
    }
    
    // ===== EXCEPCIONES: URLs de STREAMING (muy permisivo) =====
    const pathname = parsed.pathname.toLowerCase();
    const fullUrl = url.toLowerCase();
    
    // ✅ EXCEPCIÓN 1: Paths comunes de CDN/streaming
    const streamPaths = ['/stream/', '/hls/', '/vod/', '/cdn/', '/media/', '/video/', '/manifest/'];
    const hasStreamPath = streamPaths.some(path => pathname.includes(path));
    
    if (hasStreamPath) {
      return url; // CDN de streaming legítimo
    }
    
    // ✅ EXCEPCIÓN 2: Archivos de video/playlist (por extensión)
    const streamExtensions = [
      '.m3u8',      // HLS playlist
      '.txt',       // Playlist disfrazada
      '.ts',        // Transport stream segments
      '.m4s',       // DASH segments
      '.mp4',       // Video
      '.webm',      // Video
      '.mkv',       // Video
      '.aac',       // Audio
      '.mp3',       // Audio
      '.woff2',     // Segmentos disfrazados (Cuevana)
      '.mpd',       // DASH manifest
      '.vtt',       // WebVTT subtitles
      '.srt',       // SRT subtitles
    ];
    const hasStreamExtension = streamExtensions.some(ext => pathname.includes(ext));
    
    if (hasStreamExtension) {
      return url; // Archivo de streaming
    }
    
    // ✅ EXCEPCIÓN 3: URLs con parámetros típicos de streaming
    const streamParams = ['playlist', 'manifest', 'segment', 'chunk', 'quality', 'bitrate'];
    const hasStreamParam = streamParams.some(param => fullUrl.includes(param));
    
    if (hasStreamParam) {
      return url; // URL de streaming con parámetros
    }
    
    // ✅ EXCEPCIÓN 4: Subdominios comunes de CDN
    const cdnSubdomains = ['cdn', 'stream', 'video', 'media', 'content', 'player', 'cache'];
    const hasCdnSubdomain = cdnSubdomains.some(sub => hostname.startsWith(sub + '.') || hostname.includes('.' + sub + '.'));
    
    if (hasCdnSubdomain) {
      return url; // Subdominio de CDN
    }
    
    // ✅ EXCEPCIÓN 5: Dominios conocidos de ads (el player HLS los manejará si fallan)
    const isKnownAdDomain = hostname.includes('ibyteimg.com') || 
                           hostname.includes('tiktokcdn.com') ||
                           hostname.includes('doubleclick.net') || 
                           hostname.includes('googlesyndication.com') ||
                           hostname.includes('googleadservices.com');
    
    if (isKnownAdDomain) {
      return url; // Ad domain (player lo maneja)
    }
    
    // ===== WHITELIST ESTRICTO: Solo para recursos NO-streaming =====
    // (TMDB, YouTube, OpenSubtitles, etc)
    const isAllowed = ALLOWED_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );
    
    if (!isAllowed) {
      throw new Error(`Domain not in whitelist: ${hostname}`);
    }
  }
  
  return url;
}

/**
 * Validar path de archivo (prevenir path traversal)
 */
export function validateFilename(filename: unknown): string {
  if (typeof filename !== 'string') {
    throw new Error('Filename must be a string');
  }
  
  // Solo permitir nombres de archivo seguros
  const safe = filename.replace(/[^a-zA-Z0-9_.-]/g, '');
  
  // Prevenir path traversal
  if (safe.includes('..') || safe.includes('/') || safe.includes('\\')) {
    throw new Error('Invalid filename: path traversal detected');
  }
  
  // Longitud máxima
  if (safe.length > 255) {
    throw new Error('Filename too long');
  }
  
  return safe;
}

/**
 * Validar texto genérico (prevenir XSS)
 */
export function validateText(text: unknown, maxLength = 1000): string {
  if (typeof text !== 'string') {
    throw new Error('Text must be a string');
  }
  
  if (text.length > maxLength) {
    throw new Error(`Text too long (max ${maxLength})`);
  }
  
  // Sanitizar caracteres peligrosos
  return text
    .replace(/[<>'"]/g, '')  // Remover caracteres HTML peligrosos
    .trim();
}

/**
 * Validar número entero
 */
export function validateInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  
  if (isNaN(num) || !Number.isInteger(num)) {
    throw new Error('Value must be an integer');
  }
  
  if (num < min || num > max) {
    throw new Error(`Value must be between ${min} and ${max}`);
  }
  
  return num;
}

/**
 * Validar tipo de media (movie/tv)
 */
export function validateMediaType(type: unknown): 'movie' | 'tv' {
  if (type !== 'movie' && type !== 'tv') {
    throw new Error('Invalid media type: must be "movie" or "tv"');
  }
  return type;
}

/**
 * Sanitizar comando para spawn (prevenir command injection)
 */
export function sanitizeForCommand(input: string): string {
  // Validar que sea una URL válida HTTPS
  const url = new URL(input);
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    throw new Error('Invalid protocol for command');
  }
  
  // Remover caracteres peligrosos para shells
  const dangerous = /[;&|`$(){}[\]<>\\'"]/g;
  if (dangerous.test(input)) {
    throw new Error('Command injection attempt detected');
  }
  
  return input;
}
