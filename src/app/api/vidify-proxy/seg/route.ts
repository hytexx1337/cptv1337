import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Proxy para segmentos de video de Vidify (.ts, .m4s, .woff, .woff2)
 * Agrega headers necesarios para evitar CORS y 403
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const rangeHeader = req.headers.get('range');
    console.log(`[VIDIFY-PROXY-SEG] ${rangeHeader ? `Range ${rangeHeader}:` : 'Full:'} ${url.substring(0, 80)}...`);
    
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
    
    // Agregar Referer y Origin específicos
    if (url.includes('vidify')) {
      headers['Referer'] = 'https://vidify.top/';
      headers['Origin'] = 'https://vidify.top';
    } else {
      headers['Referer'] = origin;
      headers['Origin'] = origin;
    }

    // Agregar Range header si existe
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    const response = await fetch(url, { 
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error(`[VIDIFY-PROXY-SEG] ❌ Error ${response.status} ${response.statusText} al obtener: ${url.substring(0, 100)}...`);
      return NextResponse.json(
        { error: `Failed to fetch segment: ${response.status}` },
        { status: response.status }
      );
    }

    console.log(`[VIDIFY-PROXY-SEG] ✅ Recibido (${response.status})`);

    // Determinar Content-Type basado en la extensión
    let contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    if (url.includes('.ts')) {
      contentType = 'video/mp2t';
    } else if (url.includes('.m4s')) {
      contentType = 'video/iso.segment';
    } else if (url.includes('.woff') || url.includes('.woff2')) {
      contentType = 'video/mp2t'; // Vidify usa .woff/.woff2 como disfraz para segmentos de video
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const responseHeaders: HeadersInit = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    };

    // Copiar headers relevantes de la respuesta original
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength;
    }

    const contentRange = response.headers.get('content-range');
    if (contentRange) {
      responseHeaders['Content-Range'] = contentRange;
    }

    return new NextResponse(buffer, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('[VIDIFY-PROXY-SEG] Error:', error);
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

