import type { NextRequest } from 'next/server';
import http from 'http';
import https from 'https';

export const runtime = 'nodejs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

function corsHeaders(extra: Record<string, string> = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Origin,Referer,Range,User-Agent,Accept,Accept-Encoding',
    'Vary': 'Origin',
    ...extra,
  };
}

// Helper para hacer requests con Node.js HTTP nativo
function fetchUrl(url: string, options: any = {}) {
  return new Promise<{ status: number; headers: any; body: any }>((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const req = client.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 30000
    }, (res) => {
      resolve({
        status: res.statusCode || 500,
        headers: res.headers,
        body: res
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');
  
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: corsHeaders({ 'content-type': 'application/json' })
    });
  }

  try {
    // Parsear headers embebidos en la URL de Vidlink
    const parsedUrl = new URL(targetUrl);
    const headersParam = parsedUrl.searchParams.get('headers');
    const hostParam = parsedUrl.searchParams.get('host');
    
    let extraHeaders: Record<string, string> = {};
    
    if (headersParam) {
      try {
        const parsed = JSON.parse(headersParam);
        if (parsed.referer) extraHeaders['referer'] = parsed.referer;
        if (parsed.origin) extraHeaders['origin'] = parsed.origin;
      } catch {}
    }
    
    if (hostParam) {
      try {
        const hostUrl = new URL(hostParam);
        extraHeaders['referer'] = hostUrl.href;
        extraHeaders['origin'] = hostUrl.origin;
      } catch {}
    }
    
    // Si no hay headers embebidos, usar vidlink.pro por defecto
    if (!extraHeaders.referer) {
      extraHeaders['referer'] = 'https://vidlink.pro/';
      extraHeaders['origin'] = 'https://vidlink.pro';
    }
    
    // Construir URL limpia (sin los parámetros headers/host)
    const cleanUrl = new URL(targetUrl);
    cleanUrl.searchParams.delete('headers');
    cleanUrl.searchParams.delete('host');
    
    // Construir headers upstream usando Node.js HTTP
    const upstreamHeaders: Record<string, string> = {
      'user-agent': UA,
      'accept': req.headers.get('accept') || 'application/vnd.apple.mpegurl,*/*',
      'accept-encoding': 'identity',
      'accept-language': 'es-AR,es;q=0.9,en;q=0.8',
      'sec-fetch-site': 'cross-site',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      ...extraHeaders
    };
    
    if (req.headers.get('range')) {
      upstreamHeaders['range'] = req.headers.get('range')!;
    }
    
    // Fetch usando Node.js HTTP nativo
    const upstream = await fetchUrl(cleanUrl.toString(), {
      method: req.method,
      headers: upstreamHeaders
    });
    
    if (upstream.status !== 200 && upstream.status !== 206) {
      console.error(`[VIDLINK-PROXY] Upstream error: ${upstream.status}`);
      return new Response(JSON.stringify({ error: `Upstream error: ${upstream.status}` }), {
        status: upstream.status,
        headers: corsHeaders({ 'content-type': 'application/json' })
      });
    }
    
    // Determinar Content-Type
    let contentType = upstream.headers['content-type'] || 'application/octet-stream';
    
    if (/\.(m3u8|txt)(\?|$)/i.test(cleanUrl.toString())) {
      contentType = 'application/x-mpegURL';
    } else if (/\.(ts|woff2)(\?|$)/i.test(cleanUrl.toString()) || /\/seg-\d+/i.test(cleanUrl.toString())) {
      contentType = 'video/mp2t';
    }
    
    const headers: Record<string, string> = {
      ...corsHeaders(),
      'content-type': contentType,
      'cache-control': upstream.headers['cache-control'] || 'public, max-age=3600',
      'accept-ranges': upstream.headers['accept-ranges'] || 'bytes',
    };
    
    if (upstream.headers['content-length']) {
      headers['content-length'] = upstream.headers['content-length'];
    }
    if (upstream.headers['content-range']) {
      headers['content-range'] = upstream.headers['content-range'];
    }
    
    // Stream la respuesta
    const stream = new ReadableStream({
      start(controller) {
        upstream.body.on('data', (chunk: Buffer) => {
          controller.enqueue(chunk);
        });
        
        upstream.body.on('end', () => {
          controller.close();
        });
        
        upstream.body.on('error', (err: Error) => {
          controller.error(err);
        });
      }
    });
    
    return new Response(stream, {
      status: upstream.status,
      headers
    });
    
  } catch (err: any) {
    console.error('[VIDLINK-PROXY] Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders({ 'content-type': 'application/json' })
    });
  }
}
