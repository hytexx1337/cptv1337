import type { Browser, Page } from 'puppeteer';
import { createSecureBrowser, closeBrowser } from './secure-puppeteer';

export type Session = {
  id: string;
  page: Page;
  m3u8Url: string;
  sourceUrl: string;
  createdAt: number;
  cookieJar: Map<string, string>; // host -> cookie header
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

let browser: Browser | null = null;
const sessions = new Map<string, Session>();

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// 🔒 USAR PUPPETEER SEGURO (sin --no-sandbox si es root)
export async function getBrowser(): Promise<Browser> {
  if (browser) return browser;
  browser = await createSecureBrowser();
  return browser;
}

// Exportar closeBrowser para cleanup
export { closeBrowser };

export function buildSourceUrl(kind: string, id: string, season?: string, episode?: string) {
  const isTv = kind.toLowerCase() === 'tv';
  if (isTv) return `https://111movies.com/tv/${id}/${season ?? ''}/${episode ?? ''}`;
  return `https://111movies.com/movie/${id}`;
}

/**
 * Crea una sesión SIN Puppeteer usando un m3u8 cacheado
 * ⚡ Mucho más rápido (~50ms vs ~3-15s)
 */
export function startSessionFromCache(m3u8Url: string, kind: string, id: string, season?: string, episode?: string, customSourceUrl?: string): Session {
  const sourceUrl = customSourceUrl || buildSourceUrl(kind, id, season, episode);
  const idStr = genId();
  
  // Crear una "página" dummy para mantener compatibilidad
  const dummyPage = null as any; // No necesitamos la página si ya tenemos el m3u8
  
  const sess: Session = {
    id: idStr,
    page: dummyPage,
    m3u8Url,
    sourceUrl,
    createdAt: Date.now(),
    cookieJar: new Map<string, string>(),
  };
  
  sessions.set(idStr, sess);
  console.log(`⚡ [CACHE-SESSION] Sesión creada desde cache: ${idStr} (sin Puppeteer) - sourceUrl: ${sourceUrl}`);
  return sess;
}

export async function startSession(kind: string, id: string, season?: string, episode?: string): Promise<Session> {
  const b = await getBrowser();
  const page = await b.newPage();
  const sourceUrl = buildSourceUrl(kind, id, season, episode);
  await page.setUserAgent(UA);
  try {
    await page.setExtraHTTPHeaders({
      Referer: sourceUrl,
      Origin: new URL(sourceUrl).origin,
      'Accept-Language': 'es-419,es-US;q=0.9,es;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    });
  } catch {}

  let foundM3U8: string | null = null;
  try { await page.setRequestInterception(true); } catch {}
  page.on('request', (req) => {
    const url = req.url();
    if (!foundM3U8 && (/\.m3u8(\?|$)/i.test(url) || url.includes('.workers.dev/'))) {
      foundM3U8 = url;
    }
    try { req.continue(); } catch {}
  });
  page.on('response', (res) => {
    const url = res.url();
    if (!foundM3U8 && (/\.m3u8(\?|$)/i.test(url) || url.includes('.workers.dev/'))) {
      foundM3U8 = url;
    }
  });

  await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const selectors = [
    '.vjs-big-play-button','.jw-icon-play','#play','[data-action="play"]',
    'button[aria-label="Play"]','button[title="Play"]','.plyr__control[data-plyr="play"]'
  ];

  const tryClicks = async (p: Page) => {
    for (const sel of selectors) {
      try { const el = await p.$(sel); if (el) await el.click({ delay: 50 }); } catch {}
    }
  };
  await tryClicks(page);
  for (const f of page.frames()) {
    try { for (const sel of selectors) { const h = await f.$(sel); if (h) await h.click({ delay: 50 }); } } catch {}
  }

  await new Promise((r) => setTimeout(r, 3500));
  if (!foundM3U8) {
    const html = await page.content();
    const m = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/i);
    if (m) foundM3U8 = m[0];
  }
  if (!foundM3U8) {
    throw new Error('No se encontró .m3u8');
  }

  const idStr = genId();
  const sess: Session = {
    id: idStr,
    page,
    m3u8Url: foundM3U8,
    sourceUrl,
    createdAt: Date.now(),
    cookieJar: new Map<string, string>(),
  };
  // Inicializar cookies para el host de la m3u8
  try {
    const h = new URL(foundM3U8).host;
    const ck = await page.cookies(foundM3U8);
    if (ck && ck.length) {
      const cookieHeader = ck.map(c => `${c.name}=${c.value}`).join('; ');
      sess.cookieJar.set(h, cookieHeader);
    }
  } catch {}
  sessions.set(idStr, sess);
  return sess;
}

async function getCookieHeader(sessionId: string, targetUrl: string): Promise<string | undefined> {
  const sess = sessions.get(sessionId);
  if (!sess) return undefined;
  const host = new URL(targetUrl).host;
  if (sess.cookieJar.has(host)) return sess.cookieJar.get(host);
  
  // Si no hay página (sesión desde cache), no hay cookies
  if (!sess.page) return undefined;
  
  try {
    const ck = await sess.page.cookies(targetUrl);
    if (ck && ck.length) {
      const cookieHeader = ck.map(c => `${c.name}=${c.value}`).join('; ');
      sess.cookieJar.set(host, cookieHeader);
      return cookieHeader;
    }
  } catch {}
  return undefined;
}

export async function fetchPlaylist(sessionId: string): Promise<string> {
  const sess = sessions.get(sessionId);
  if (!sess) throw new Error('Sesión inválida');
  const { m3u8Url, sourceUrl } = sess;
  const cookieHeader = await getCookieHeader(sessionId, m3u8Url);

  const targetOrigin = new URL(m3u8Url).origin;

  const buildHeaders = (mode: 'primary' | 'noRef' | 'targetRef'): Record<string, string> => {
    const h: Record<string, string> = {
      'User-Agent': UA,
      'Accept': mode === 'primary'
        ? 'application/vnd.apple.mpegurl,application/x-mpegURL;q=0.9,*/*;q=0.8'
        : '*/*',
      'Accept-Language': 'es-419,es-US;q=0.9,es;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Connection': 'keep-alive',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      'Accept-Encoding': 'identity',
    };
    if (mode === 'primary') {
      h['Referer'] = sourceUrl;
      h['Origin'] = new URL(sourceUrl).origin;
    } else if (mode === 'targetRef') {
      h['Referer'] = targetOrigin + '/';
      h['Origin'] = targetOrigin;
    }
    if (cookieHeader) h['Cookie'] = cookieHeader;
    return h;
  };

  let resp = await fetch(m3u8Url, { method: 'GET', headers: buildHeaders('primary') });
  if (!resp.ok && (resp.status === 403 || resp.status === 401 || resp.status === 405)) {
    resp = await fetch(m3u8Url, { method: 'GET', headers: buildHeaders('noRef') });
  }
  if (!resp.ok && (resp.status === 403 || resp.status === 401 || resp.status === 405)) {
    resp = await fetch(m3u8Url, { method: 'GET', headers: buildHeaders('targetRef') });
  }
  if (!resp.ok) throw new Error(`Upstream error m3u8 (${resp.status})`);
  const txt = await resp.text();
  const baseUrl = new URL(m3u8Url);
  const lines = txt.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith('#')) { out.push(line); continue; }
    let abs: URL;
    try { abs = new URL(line); } catch { abs = new URL(line, baseUrl); }
    out.push(`/api/hls-browser-proxy/seg?sid=${encodeURIComponent(sessionId)}&u=${encodeURIComponent(abs.toString())}`);
  }
  return out.join('\n') + '\n';
}

export async function fetchSegment(sessionId: string, url: string, rangeHeader?: string): Promise<{ status: number; headers: Record<string,string>; body: Buffer; }> {
  const sess = sessions.get(sessionId);
  if (!sess) throw new Error('Sesión inválida');
  const cookieHeader = await getCookieHeader(sessionId, url);
  const targetOrigin = new URL(url).origin;

  const buildHeaders = (mode: 'primary' | 'noRef' | 'targetRef'): Record<string, string> => {
    const h: Record<string, string> = {
      'User-Agent': UA,
      'Accept': '*/*',
      'Accept-Language': 'es-419,es-US;q=0.9,es;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Connection': 'keep-alive',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      'Accept-Encoding': 'identity',
    };
    if (mode === 'primary') {
      h['Referer'] = sess.sourceUrl;
      h['Origin'] = new URL(sess.sourceUrl).origin;
    } else if (mode === 'targetRef') {
      h['Referer'] = targetOrigin + '/';
      h['Origin'] = targetOrigin;
    }
    if (cookieHeader) h['Cookie'] = cookieHeader;
    if (rangeHeader) h['Range'] = rangeHeader;
    return h;
  };

  let resp = await fetch(url, { method: 'GET', headers: buildHeaders('primary') });
  if (!resp.ok && (resp.status === 403 || resp.status === 401 || resp.status === 405)) {
    resp = await fetch(url, { method: 'GET', headers: buildHeaders('noRef') });
  }
  if (!resp.ok && (resp.status === 403 || resp.status === 401 || resp.status === 405)) {
    resp = await fetch(url, { method: 'GET', headers: buildHeaders('targetRef') });
  }
  const status = resp.status || 200;

  const contentType = resp.headers.get('content-type') || '';
  const isM3U8 = contentType.includes('mpegurl') || url.toLowerCase().includes('.m3u8');

  // Si es un playlist m3u8 secundario, reescribir líneas y URIs como en el master
  if (isM3U8) {
    const txt = await resp.text();
    const baseUrl = new URL(url);
    const out: string[] = [];

    // Helper para reescribir atributos URI="..." dentro de líneas como EXT-X-KEY
    const rewriteUriAttr = (line: string): string => {
      const m = line.match(/URI=("|')(.*?)(\1)/i);
      if (m && m[2]) {
        let abs: URL;
        try { abs = new URL(m[2]); } catch { abs = new URL(m[2], baseUrl); }
        const rewritten = `/api/hls-browser-proxy/seg?sid=${encodeURIComponent(sessionId)}&u=${encodeURIComponent(abs.toString())}`;
        return line.replace(m[0], `URI="${rewritten}"`);
      }
      return line;
    };

    for (const line of txt.split(/\r?\n/)) {
      if (!line) { out.push(line); continue; }
      if (line.startsWith('#')) {
        // Reescribir posibles URIs en atributos
        out.push(rewriteUriAttr(line));
        continue;
      }
      let abs: URL;
      try { abs = new URL(line); } catch { abs = new URL(line, baseUrl); }
      out.push(`/api/hls-browser-proxy/seg?sid=${encodeURIComponent(sessionId)}&u=${encodeURIComponent(abs.toString())}`);
    }
    const rewritten = out.join('\n') + '\n';
    const headers: Record<string,string> = {
      'content-type': 'application/vnd.apple.mpegurl',
      'cache-control': resp.headers.get('cache-control') || 'no-cache',
    };
    headers['content-length'] = Buffer.byteLength(rewritten, 'utf8').toString();
    return { status, headers, body: Buffer.from(rewritten, 'utf8') };
  }

  // Caso normal (segmentos binarios)
  // Detectar segmentos HLS disfrazados (con extensiones como .js, .css, .png, etc.)
  // Patrones comunes: seg-XX-f1-v1-a1.js, seg-XX-f1-v1-a1.png, etc.
  const isHlsSegment = /\/seg-\d+-[^\/]+\.(js|css|txt|png|jpg|jpeg|webp|ico|woff|woff2|svg|json|html|xml)$/i.test(url) ||
                      /\/seg-\d+-[^\/]+\.(ts|m4s|mp4)$/i.test(url) ||
                      url.includes('/hls') || url.includes('/segment');
  
  const passHeaders: Record<string, string> = {};
  const keys = ['content-length','accept-ranges','content-range','cache-control'];
  for (const k of keys) {
    const v = resp.headers.get(k);
    if (v) passHeaders[k] = v;
  }
  
  // Forzar Content-Type correcto para segmentos HLS
  if (isHlsSegment) {
    passHeaders['content-type'] = 'video/mp2t';
    console.log(`🎬 [HLS-PROXY] Segmento HLS detectado (disfrazado): ${url.substring(0, 100)}... -> video/mp2t`);
  } else {
    // Para otros archivos, usar el Content-Type del upstream
    const upstreamContentType = resp.headers.get('content-type');
    if (upstreamContentType) {
      passHeaders['content-type'] = upstreamContentType;
    }
  }
  
  const arrBuf = await resp.arrayBuffer();
  return { status, headers: passHeaders, body: Buffer.from(arrBuf) };
}

// Limpieza simple por TTL
export async function cleanupOldSessions(maxAgeMs = 15 * 60 * 1000) {
  const now = Date.now();
  for (const [sid, sess] of sessions.entries()) {
    if ((now - sess.createdAt) > maxAgeMs) {
      try { await sess.page.close(); } catch {}
      sessions.delete(sid);
    }
  }
}