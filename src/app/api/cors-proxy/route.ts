import type { NextRequest } from 'next/server';
import { validateUrl } from '@/lib/input-validator';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

function corsHeaders(extra: Record<string, string> = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Origin,Referer,Range,User-Agent,Accept,Accept-Encoding',
    Vary: 'Origin',
    ...extra,
  };
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}

export async function HEAD(req: NextRequest) {
  const url = new URL(req.url);
  const target = url.searchParams.get('url');
  const ref = url.searchParams.get('ref') || '';
  const uaParam = url.searchParams.get('ua') || '';
  const forceRef = url.searchParams.get('forceRef') === '1';
  if (!target) return new Response(null, { status: 400, headers: corsHeaders() });
  
  // 🔒 VALIDAR URL PARA PREVENIR SSRF
  try {
    validateUrl(target);
  } catch (validationError) {
    console.error('❌ SSRF attempt blocked:', target);
    return new Response(JSON.stringify({ error: 'Invalid or blocked URL' }), { 
      status: 403, 
      headers: corsHeaders({ 'content-type': 'application/json' })
    });
  }
  try {
    // Construir headers similares a GET
    const clientUA = req.headers.get('user-agent');
    const userAgent = uaParam || clientUA || DEFAULT_UA;
    const headers: Record<string, string> = {
      'user-agent': userAgent,
      accept: req.headers.get('accept') || 'application/vnd.apple.mpegurl,*/*',
      'accept-encoding': req.headers.get('accept-encoding') || 'identity',
      'accept-language': req.headers.get('accept-language') || 'es-AR,es;q=0.9,en;q=0.8',
      'sec-fetch-site': 'cross-site',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
    };
    // Solo aplicar Referer/Origin si ref está presente y coincide el host
    if (ref) {
      try {
        const targetUrl = new URL(target);
        const refUrl = new URL(ref);
        if (forceRef || refUrl.hostname === targetUrl.hostname) {
          headers['origin'] = refUrl.origin;
          headers['referer'] = refUrl.origin + '/';
        }
      } catch {}
    }

    let upstream = await fetch(target, { method: 'HEAD', headers, redirect: 'follow' });

    // Algunos CDNs bloquean HEAD: hacer fallback a GET para obtener metadatos
    if (upstream.status === 403 || upstream.status === 405) {
      upstream = await fetch(target, { method: 'GET', headers, redirect: 'follow' });
    }

    // Determinar Content-Type apropiado
    let type = upstream.headers.get('content-type') || 'application/octet-stream';
    
    // Detectar playlists HLS (incluyendo .woff2 que sean master/index/playlist)
    const isWoff2Playlist = /\/(master|index|playlist)[\.\-].*\.woff2(\?|$)/i.test(target);
    if (/\.(m3u8|txt)(\?|$)/i.test(target) || isWoff2Playlist) {
      type = 'application/x-mpegURL';
    } else if (/\.(ts|woff2)(\?|$)/i.test(target)) {
      type = 'video/mp2t';
    } else if (/\/seg-\d+-[^\/]+\.(js|css|txt|png|jpg|jpeg|webp|ico|woff|woff2|svg|json|html|xml|ts|m4s|mp4)(\?|$)/i.test(target) ||
               /\/hls\/.*\/seg-\d+/i.test(target) ||
               /\/segment\/.*\/seg-\d+/i.test(target)) {
      // Detectar segmentos HLS disfrazados con cualquier extensión
      type = 'video/mp2t';
    }
    const respHeaders = new Headers(corsHeaders({ 'content-type': type }));
    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) respHeaders.set('accept-ranges', acceptRanges);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) respHeaders.set('content-length', contentLength);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) respHeaders.set('content-range', contentRange);
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) respHeaders.set('cache-control', cacheControl);
    const etag = upstream.headers.get('etag');
    if (etag) respHeaders.set('etag', etag);
    const lastModified = upstream.headers.get('last-modified');
    if (lastModified) respHeaders.set('last-modified', lastModified);
    if (!respHeaders.get('accept-ranges')) respHeaders.set('accept-ranges', 'bytes');

    return new Response(null, {
      status: upstream.ok ? 200 : upstream.status,
      headers: respHeaders,
    });
  } catch (e) {
    return new Response(null, { status: 502, headers: corsHeaders() });
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const target = url.searchParams.get('url');
  const ref = url.searchParams.get('ref') || '';
  const uaParam = url.searchParams.get('ua') || '';
  const forceRef = url.searchParams.get('forceRef') === '1';
  if (!target) {
    return new Response(JSON.stringify({ error: 'Missing url param' }), {
      status: 400,
      headers: corsHeaders({ 'content-type': 'application/json' }),
    });
  }

  // 🔒 VALIDAR URL PARA PREVENIR SSRF
  try {
    validateUrl(target);
  } catch (validationError) {
    console.error('❌ SSRF attempt blocked:', target);
    return new Response(JSON.stringify({ error: 'Invalid or blocked URL' }), { 
      status: 403, 
      headers: corsHeaders({ 'content-type': 'application/json' })
    });
  }

  // Build headers, forwarding relevant ones and setting safe defaults
  const clientUA = req.headers.get('user-agent');
  const userAgent = uaParam || clientUA || DEFAULT_UA;
  const isWoff2PlaylistReq = /\/(master|index|playlist)[\.\-].*\.woff2(\?|$)/i.test(target);
  const isPlaylistRequest = /\.(m3u8|txt)(\?|$)/i.test(target) || isWoff2PlaylistReq;
  const headers: Record<string, string> = {
    'user-agent': userAgent,
    accept: isPlaylistRequest ? 'application/vnd.apple.mpegurl,*/*' : 'video/*;q=0.9,*/*;q=0.8',
    'accept-language': req.headers.get('accept-language') || 'es-AR,es;q=0.9,en;q=0.8',
    'sec-fetch-site': 'cross-site',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': isPlaylistRequest ? 'empty' : 'video',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
  };

  const range = req.headers.get('range');
  if (range) headers['range'] = range;

  const enc = req.headers.get('accept-encoding');
  if (enc) headers['accept-encoding'] = enc;

  // No enviar Origin/Referer por defecto; aplicar ref SOLO si coincide el host
  if (ref) {
    try {
      const targetUrl = new URL(target);
      const refUrl = new URL(ref);
      if (forceRef || refUrl.hostname === targetUrl.hostname) {
        headers['origin'] = refUrl.origin;
        headers['referer'] = refUrl.origin + '/';
      }
    } catch {}
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers, redirect: 'follow' });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Upstream fetch failed' }), {
      status: 502,
      headers: corsHeaders({ 'content-type': 'application/json' }),
    });
  }

  // Si el upstream rechaza por política (403/401/405), hacer una cascada de reintentos
  if (!upstream.ok && (upstream.status === 403 || upstream.status === 401 || upstream.status === 405)) {
    // 1) Sin Referer/Origin
    const retry1: Record<string, string> = { ...headers };
    delete retry1['referer'];
    delete retry1['origin'];
    try { upstream = await fetch(target, { headers: retry1, redirect: 'follow' }); } catch {}

    // 2) Accept más permisivo y sin compression
    if (!upstream.ok) {
      const retry2: Record<string, string> = { ...retry1 };
      retry2['accept'] = '*/*';
      delete retry2['accept-encoding'];
      try { upstream = await fetch(target, { headers: retry2, redirect: 'follow' }); } catch {}
    }

    // 3) Forzar Referer proporcionado aunque no coincida host (si ref viene)
    if (!upstream.ok && ref) {
      try {
        const refUrl = new URL(ref);
        const retry3: Record<string, string> = { ...headers };
        retry3['referer'] = refUrl.origin + '/';
        retry3['origin'] = refUrl.origin;
        try { upstream = await fetch(target, { headers: retry3, redirect: 'follow' }); } catch {}
      } catch {}
    }
  }

  // Determinar Content-Type apropiado
  let typeOverride = upstream.headers.get('content-type') || 'application/octet-stream';
  
  // Detectar playlists HLS (incluyendo .woff2 que sean master/index/playlist)
  const isWoff2Playlist = /\/(master|index|playlist)[\.\-].*\.woff2(\?|$)/i.test(target);
  if (/\.(m3u8|txt)(\?|$)/i.test(target) || isWoff2Playlist) {
    typeOverride = 'application/vnd.apple.mpegurl';
  } else if (/\.(ts|woff2)(\?|$)/i.test(target)) {
    // Segmentos HLS (incluso disfrazados como .woff2)
    typeOverride = 'video/mp2t';
  } else if (/\/seg-\d+-[^\/]+\.(js|css|txt|png|jpg|jpeg|webp|ico|woff|woff2|svg|json|html|xml|ts|m4s|mp4)(\?|$)/i.test(target) ||
             /\/hls\/.*\/seg-\d+/i.test(target) ||
             /\/segment\/.*\/seg-\d+/i.test(target)) {
    // Detectar segmentos HLS disfrazados con cualquier extensión
    // Patrones: seg-XX-f1-v1-a1.js, seg-XX-f1-v1-a1.png, etc.
    typeOverride = 'video/mp2t';
    console.log(`🎬 [CORS-PROXY] Segmento HLS disfrazado detectado: ${target.substring(0, 100)}... -> video/mp2t`);
  }

  const respHeaders = new Headers(corsHeaders({ 'content-type': typeOverride }));
  const acceptRanges = upstream.headers.get('accept-ranges');
  if (acceptRanges) respHeaders.set('accept-ranges', acceptRanges);
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) respHeaders.set('content-length', contentLength);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) respHeaders.set('content-range', contentRange);
  const cacheControl = upstream.headers.get('cache-control');
  if (cacheControl) respHeaders.set('cache-control', cacheControl);

  // 🔧 REESCRIBIR URLs RELATIVAS EN M3U8 y TXT (playlists HLS)
  const isWoff2PlaylistCheck = /\/(master|index|playlist)[\.\-].*\.woff2(\?|$)/i.test(target);
  const isPlaylist = /\.(m3u8|txt)(\?|$)/i.test(target) || isWoff2PlaylistCheck || typeOverride.includes('mpegurl');
  if (isPlaylist) {
    console.log(`🔄 [CORS-PROXY] Reescribiendo playlist: ${target}`);
    try {
      // OPTIMIZACIÓN: Clonar response antes de leer (el body solo se puede leer una vez)
      const clonedResponse = upstream.clone();
      const baseUrl = new URL(target);
      let rewrittenCount = 0;
      let buffer = '';
      
      // Helper: reescribir atributos URI="..." en líneas como EXT-X-KEY, EXT-X-MAP
      const rewriteUriAttr = (line: string): string => {
        const match = line.match(/URI=("|')(.*?)(\1)/i);
        if (match && match[2]) {
          try {
            const uriValue = match[2];
            const absoluteUrl = uriValue.startsWith('http') 
              ? uriValue 
              : new URL(uriValue, baseUrl).toString();
            const proxiedUrl = `/api/cors-proxy?url=${encodeURIComponent(absoluteUrl)}&ref=${encodeURIComponent(baseUrl.origin + '/')}&forceRef=1`;
            return line.replace(match[0], `URI="${proxiedUrl}"`);
          } catch {
            return line;
          }
        }
        return line;
      };

      // Helper: reescribir una línea
      const rewriteLine = (line: string): string => {
        if (!line) return line;
        
        // Comentarios y tags - reescribir atributos URI si existen
        if (line.startsWith('#')) {
          return rewriteUriAttr(line);
        }

        // Reescribir URLs de segmentos/playlists
        try {
          const absoluteUrl = line.startsWith('http') 
            ? line 
            : new URL(line, baseUrl).toString();
          const proxiedUrl = `/api/cors-proxy?url=${encodeURIComponent(absoluteUrl)}&ref=${encodeURIComponent(baseUrl.origin + '/')}&forceRef=1`;
          rewrittenCount++;
          return proxiedUrl;
        } catch {
          return line;
        }
      };

      // Intentar streaming primero (más rápido para M3U8s grandes)
      const reader = clonedResponse.body?.getReader();
      if (reader) {
        const stream = new ReadableStream({
          async start(controller) {
            const decoder = new TextDecoder();
            
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  // Procesar buffer final
                  if (buffer) {
                    const lines = buffer.split(/\r?\n/);
                    for (const line of lines) {
                      const rewritten = rewriteLine(line);
                      controller.enqueue(new TextEncoder().encode(rewritten + '\n'));
                    }
                  }
                  break;
                }

                // Decodificar chunk y agregar al buffer
                buffer += decoder.decode(value, { stream: true });
                
                // Procesar líneas completas
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || ''; // Guardar línea incompleta
                
                for (const line of lines) {
                  const rewritten = rewriteLine(line);
                  controller.enqueue(new TextEncoder().encode(rewritten + '\n'));
                }
              }
              
              console.log(`✅ [CORS-PROXY] Reescrito ${rewrittenCount} URLs en M3U8 (streaming)`);
              controller.close();
            } catch (e) {
              console.error('Error en streaming M3U8:', e);
              controller.error(e);
            }
          }
        });

        // Remover content-length porque es un stream
        respHeaders.delete('content-length');
        respHeaders.set('transfer-encoding', 'chunked');

        return new Response(stream, {
          status: 200,
          headers: respHeaders,
        });
      }
    } catch (e) {
      console.error('Error en streaming M3U8, usando método tradicional:', e);
      // Fallback: método tradicional (más lento pero más confiable)
      try {
        const text = await upstream.text();
        const baseUrl = new URL(target);
        const lines = text.split(/\r?\n/);
        const rewritten: string[] = [];
        let rewrittenCount = 0;

        const rewriteUriAttr = (line: string): string => {
          const match = line.match(/URI=("|')(.*?)(\1)/i);
          if (match && match[2]) {
            try {
              const uriValue = match[2];
              const absoluteUrl = uriValue.startsWith('http') 
                ? uriValue 
                : new URL(uriValue, baseUrl).toString();
              const proxiedUrl = `/api/cors-proxy?url=${encodeURIComponent(absoluteUrl)}&ref=${encodeURIComponent(baseUrl.origin + '/')}&forceRef=1`;
              return line.replace(match[0], `URI="${proxiedUrl}"`);
            } catch {
              return line;
            }
          }
          return line;
        };

        for (const line of lines) {
          if (!line) {
            rewritten.push(line);
            continue;
          }
          if (line.startsWith('#')) {
            rewritten.push(rewriteUriAttr(line));
            continue;
          }
          try {
            const absoluteUrl = line.startsWith('http') 
              ? line 
              : new URL(line, baseUrl).toString();
            const proxiedUrl = `/api/cors-proxy?url=${encodeURIComponent(absoluteUrl)}&ref=${encodeURIComponent(baseUrl.origin + '/')}&forceRef=1`;
            rewritten.push(proxiedUrl);
            rewrittenCount++;
          } catch {
            rewritten.push(line);
          }
        }

        const rewrittenText = rewritten.join('\n');
        respHeaders.set('content-length', Buffer.byteLength(rewrittenText, 'utf8').toString());
        respHeaders.delete('transfer-encoding');
        
        console.log(`✅ [CORS-PROXY] Reescrito ${rewrittenCount} URLs en M3U8 (fallback)`);
        return new Response(rewrittenText, {
          status: 200,
          headers: respHeaders,
        });
      } catch (fallbackError) {
        console.error('Error en fallback M3U8:', fallbackError);
        // Si todo falla, devolver el original sin procesar
      }
    }
  }

  return new Response(upstream.body, {
    status: upstream.ok ? 200 : upstream.status,
    headers: respHeaders,
  });
}