import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cache simple en memoria para M3U8 reescritos (evita reprocesar)
const m3u8Cache = new Map<string, { content: string; timestamp: number; isVOD: boolean; }>();
const VOD_CACHE_TTL = 10 * 60 * 1000; // 10 minutos para VOD (contenido que no cambia)
const LIVE_CACHE_TTL = 30 * 1000; // 30 segundos para streams live

/**
 * Intenta invalidar el caché de vidify-unified cuando una URL falla
 * Usa la metadata pasada en query params para identificar el contenido
 */
async function invalidateVidifyCache(
  originalUrl: string, 
  statusCode: number,
  type?: string,
  id?: string,
  season?: string,
  episode?: string,
  language?: string
) {
  try {
    // Solo invalidar en errores específicos (permanentes o temporales graves)
    if (![403, 404, 410, 500, 502, 503].includes(statusCode)) {
      return;
    }

    console.log(`[VIDIFY-PROXY-M3U8] 🗑️ Invalidando caché debido a error ${statusCode}...`);

    // Limpiar cache local de M3U8
    m3u8Cache.delete(originalUrl);
    console.log(`[VIDIFY-PROXY-M3U8] ✅ Cache local de M3U8 limpiado`);
    
    // Si tenemos metadata, invalidar el caché de vidify-unified
    if (type && id && language) {
      // IMPORTANTE: Usar localhost para llamadas internas (mismo servidor)
      const port = process.env.PORT || 3000;
      const deleteUrl = `http://localhost:${port}/api/streams/vidify-unified?type=${type}&id=${id}${season ? `&season=${season}&episode=${episode}` : ''}&language=${encodeURIComponent(language)}`;
      
      console.log(`[VIDIFY-PROXY-M3U8] 🔗 Invalidando caché Vidify: ${deleteUrl}`);
      
      const deleteResponse = await fetch(deleteUrl, { method: 'DELETE' });
      
      if (deleteResponse.ok) {
        const result = await deleteResponse.json();
        console.log(`[VIDIFY-PROXY-M3U8] ✅ Caché Vidify invalidado:`, result);
      } else {
        console.error(`[VIDIFY-PROXY-M3U8] ❌ Error al invalidar caché Vidify: ${deleteResponse.status}`);
      }
    } else {
      console.log(`[VIDIFY-PROXY-M3U8] ⚠️ Sin metadata suficiente para invalidar caché Vidify (type: ${type}, id: ${id}, language: ${language})`);
    }
    
  } catch (error) {
    console.error(`[VIDIFY-PROXY-M3U8] ❌ Error al invalidar caché:`, error);
  }
}

/**
 * Proxy para playlists M3U8 de Vidify
 * Agrega headers necesarios (Referer, Origin) para evitar CORS y 403
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  
  // Metadata para invalidación de caché (opcional)
  const type = searchParams.get('type');
  const id = searchParams.get('id');
  const season = searchParams.get('season');
  const episode = searchParams.get('episode');
  const language = searchParams.get('language');
  
  // 🆕 Headers opcionales desde el scraper
  const customReferer = searchParams.get('referer');
  const customOrigin = searchParams.get('origin');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Chequear cache primero
    const cached = m3u8Cache.get(url);
    if (cached) {
      const cacheTTL = cached.isVOD ? VOD_CACHE_TTL : LIVE_CACHE_TTL;
      if (Date.now() - cached.timestamp < cacheTTL) {
        const cacheType = cached.isVOD ? 'VOD' : 'LIVE';
        console.log(`[VIDIFY-PROXY-M3U8] ♻️ Cache ${cacheType} hit para: ${url.substring(0, 80)}...`);
        return new NextResponse(cached.content, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Content-Type',
            'Cache-Control': cached.isVOD ? 'public, max-age=600' : 'public, max-age=30',
          },
        });
      }
    }
    
    console.log(`[VIDIFY-PROXY-M3U8] 📥 Fetching: ${url.substring(0, 100)}...`);
    
    // Headers para bypass de CORS y hotlinking
    const headers: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
    };

    // Detectar origen basado en la URL
    const urlObj = new URL(url);
    const origin = `${urlObj.protocol}//${urlObj.host}`;
    
    // 🆕 Usar headers personalizados si vienen del scraper
    let referer: string;
    let originHeader: string;
    
    if (customReferer) {
      referer = customReferer;
      originHeader = customOrigin || new URL(customReferer).origin;
      console.log(`[VIDIFY-PROXY-M3U8] 🎯 Usando headers custom: Referer=${referer}, Origin=${originHeader}`);
    } else {
      // Lógica anterior basada en detección
      if (url.includes('vidify')) {
        referer = 'https://vidify.top/';
        originHeader = 'https://vidify.top';
      } else if (url.includes('vidhide') || url.includes('vidhidepro') || url.includes('premilkyway')) {
        referer = 'https://vidhide.com/';
        originHeader = 'https://vidhide.com';
      } else if (url.includes('kinej395aoo.com')) {
        referer = origin;
        originHeader = origin;
      } else {
        referer = origin;
        originHeader = origin;
      }
    }
    
    // Agregar Referer y Origin
    headers['Referer'] = referer;
    headers['Origin'] = originHeader;

    let response = await fetch(url, { 
      headers,
      cache: 'no-store'
    });

    // 🌐 FALLBACK: Si falla con 403/404, usar el proxy público de Vidify
    if (!response.ok && (response.status === 403 || response.status === 404) && url.includes('kinej395aoo.com')) {
      console.log(`[VIDIFY-PROXY-M3U8] ⚠️ Error ${response.status}, intentando con proxy público de Vidify...`);
      
      try {
        // Construir URL del proxy de Vidify
        const vidifyProxyUrl = `https://proxify.vidify.top/proxy?url=${encodeURIComponent(url)}`;
        
        console.log(`[VIDIFY-PROXY-M3U8] 🌥️ Usando: ${vidifyProxyUrl.substring(0, 100)}...`);
        
        response = await fetch(vidifyProxyUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Referer': 'https://player.vidify.top/',
            'Origin': 'https://player.vidify.top',
          },
          cache: 'no-store'
        });
        
        if (response.ok) {
          console.log(`[VIDIFY-PROXY-M3U8] ✅ Proxy público funcionó! Status: ${response.status}`);
        } else {
          console.error(`[VIDIFY-PROXY-M3U8] ❌ Proxy público también falló: ${response.status}`);
        }
      } catch (proxyError: any) {
        console.error(`[VIDIFY-PROXY-M3U8] ❌ Error con proxy público:`, proxyError.message);
      }
    }

    if (!response.ok) {
      console.error(`[VIDIFY-PROXY-M3U8] ❌ Error ${response.status} ${response.statusText} al obtener: ${url}`);
      console.error(`[VIDIFY-PROXY-M3U8] Response headers:`, Object.fromEntries(response.headers.entries()));
      
      // Invalidar caché si es un error permanente
      await invalidateVidifyCache(
        url, 
        response.status,
        type || undefined,
        id || undefined,
        season || undefined,
        episode || undefined,
        language || undefined
      );
      
      return NextResponse.json(
        { error: `Failed to fetch M3U8: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    console.log(`[VIDIFY-PROXY-M3U8] ✅ Recibido (${response.status}), Content-Type: ${response.headers.get('content-type')}`);
    const contentType = response.headers.get('content-type') || 'application/vnd.apple.mpegurl';
    let content = await response.text();
    console.log(`[VIDIFY-PROXY-M3U8] Content length: ${content.length} bytes, primeras líneas:`, content.substring(0, 200));

    // Reescribir URLs en el M3U8 para que pasen por el proxy
    const lines = content.split('\n');
    const rewrittenLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Líneas vacías
      if (!trimmed) {
        rewrittenLines.push(line);
        continue;
      }
      
      // Parsear tags especiales que contienen URIs (#EXT-X-MAP, #EXT-X-KEY, #EXT-X-MEDIA, etc)
      if (trimmed.startsWith('#EXT-X-MAP:') || trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MEDIA:')) {
        const uriMatch = trimmed.match(/URI="([^"]+)"/);
        if (uriMatch) {
          const originalUri = uriMatch[1];
          
          // Resolver la URI
          let fullUrl: string;
          if (originalUri.startsWith('http://') || originalUri.startsWith('https://')) {
            fullUrl = originalUri;
          } else {
            const urlBase = new URL(url);
            if (originalUri.startsWith('/')) {
              fullUrl = `${urlBase.protocol}//${urlBase.host}${originalUri}`;
            } else {
              const pathParts = urlBase.pathname.split('/');
              pathParts.pop();
              pathParts.push(originalUri);
              fullUrl = `${urlBase.protocol}//${urlBase.host}${pathParts.join('/')}`;
            }
          }
          
          // Decidir qué proxy usar según el tipo de archivo
          let proxiedUri: string;
          const headersParam = customReferer ? `&referer=${encodeURIComponent(customReferer)}&origin=${encodeURIComponent(customOrigin || new URL(customReferer).origin)}` : '';
          
          if (fullUrl.includes('.m3u8') || fullUrl.includes('.txt')) {
            // Es un playlist, usar proxy de m3u8 (pasar headers si existen)
            proxiedUri = `/api/vidify-proxy/m3u8?url=${encodeURIComponent(fullUrl)}${headersParam}`;
          } else {
            // Es un segmento, usar proxy de segmentos (pasar headers si existen)
            proxiedUri = `/api/vidify-proxy/seg?url=${encodeURIComponent(fullUrl)}${headersParam}`;
          }
          
          // Reemplazar la URI en el tag
          const rewrittenLine = trimmed.replace(/URI="[^"]+"/, `URI="${proxiedUri}"`);
          rewrittenLines.push(rewrittenLine);
          continue;
        }
      }
      
      // Otros comentarios (sin URLs)
      if (trimmed.startsWith('#')) {
        rewrittenLines.push(line);
        continue;
      }
      
      // Resolver URL (puede ser relativa o absoluta)
      let fullUrl: string;
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        fullUrl = trimmed;
      } else {
        // URL relativa, resolverla basándose en la URL actual
        const urlBase = new URL(url);
        if (trimmed.startsWith('/')) {
          // Ruta absoluta desde el origen
          fullUrl = `${urlBase.protocol}//${urlBase.host}${trimmed}`;
        } else {
          // Ruta relativa, usar el directorio de la URL actual
          let relativePath = trimmed;
          
          // Normalizar ./ y ../ en la ruta
          while (relativePath.startsWith('./')) {
            relativePath = relativePath.substring(2);
          }
          
          const pathParts = urlBase.pathname.split('/');
          pathParts.pop(); // Quitar el archivo actual
          
          // Manejar ../ (subir directorio)
          while (relativePath.startsWith('../')) {
            relativePath = relativePath.substring(3);
            pathParts.pop();
          }
          
          pathParts.push(relativePath);
          fullUrl = `${urlBase.protocol}//${urlBase.host}${pathParts.join('/')}`;
        }
      }
      
      // Log solo primeras 3 líneas (eliminar logs de .woff para reducir spam)
      if (i < 3) {
        console.log(`[VIDIFY-PROXY-M3U8] 🔗 "${trimmed}" -> "${fullUrl}"`);
      }
      
      // Decidir qué proxy usar
      const headersParam = customReferer ? `&referer=${encodeURIComponent(customReferer)}&origin=${encodeURIComponent(customOrigin || new URL(customReferer).origin)}` : '';
      
      if (fullUrl.includes('.m3u8') || fullUrl.includes('.txt')) {
        // Otro playlist, usar el proxy de m3u8 (pasar headers si existen)
        rewrittenLines.push(`/api/vidify-proxy/m3u8?url=${encodeURIComponent(fullUrl)}${headersParam}`);
      } else {
        // Segmento de video, usar el proxy de segmentos (pasar headers si existen)
        rewrittenLines.push(`/api/vidify-proxy/seg?url=${encodeURIComponent(fullUrl)}${headersParam}`);
      }
    }
    
    content = rewrittenLines.join('\n');
    
    // Detectar si es VOD (contenido estático) o LIVE (dinámico)
    const isVOD = content.includes('#EXT-X-PLAYLIST-TYPE:VOD') || content.includes('#EXT-X-ENDLIST');
    
    // Guardar en cache con tipo
    m3u8Cache.set(url, { content, timestamp: Date.now(), isVOD });
    
    // Limpiar cache viejo
    const maxTTL = Math.max(VOD_CACHE_TTL, LIVE_CACHE_TTL);
    for (const [key, value] of m3u8Cache.entries()) {
      const ttl = value.isVOD ? VOD_CACHE_TTL : LIVE_CACHE_TTL;
      if (Date.now() - value.timestamp > ttl) {
        m3u8Cache.delete(key);
      }
    }
    
    const cacheType = isVOD ? 'VOD' : 'LIVE';
    console.log(`[VIDIFY-PROXY-M3U8] ✅ Reescrito (${rewrittenLines.length} líneas) y cacheado como ${cacheType}`);

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Cache-Control': isVOD ? 'public, max-age=600' : 'public, max-age=30',
      },
    });
  } catch (error: any) {
    console.error('[VIDIFY-PROXY-M3U8] Error:', error);
    return NextResponse.json(
      { error: 'Proxy error', details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
    },
  });
}

