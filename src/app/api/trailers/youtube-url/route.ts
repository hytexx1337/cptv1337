import { NextRequest, NextResponse } from 'next/server';

// Evitar caché y asegurar ejecución dinámica
export const dynamic = 'force-dynamic';

// URL del servidor de trailers (Flask + Playwright IMDb)
const TRAILER_SERVER_URL = 'http://81.17.102.98:5000';

/**
 * Proxy para obtener el stream de trailer desde IMDb.
 *
 * Query params:
 * - imdbId: ID de IMDb (ej: "tt5743796")
 * - lang: idioma para la ruta IMDb (ej: "es")
 * - prefer: "mp4" | "m3u8"
 * - maxDuration: duración máxima en segundos (default 120)
 * - timeout: segundos (default 30)
 * - headless: "true" | "false" (default "true")
 *
 * Respuesta (desde el servidor Flask):
 * - stream_url: URL directa (.mp4 o .m3u8)
 * - kind: "mp4" | "m3u8"
 * - page_url, title, duration_seconds
 * - expires_in_seconds / policy_expires_in_seconds (si aplica)
 * - headers, cookie_header
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imdbId = searchParams.get('imdbId');

  if (!imdbId) {
    return NextResponse.json(
      { error: 'Falta parámetro: imdbId' },
      { status: 400 }
    );
  }

  const lang = searchParams.get('lang') || null;
  const prefer = searchParams.get('prefer') || null;
  const maxDuration = searchParams.get('maxDuration') || null;
  const timeout = searchParams.get('timeout') || null;
  const headless = searchParams.get('headless') || 'true';

  const proxyParams = new URLSearchParams();
  proxyParams.set('imdbId', imdbId);
  if (lang) proxyParams.set('lang', lang);
  if (prefer) proxyParams.set('prefer', prefer);
  if (maxDuration) proxyParams.set('maxDuration', maxDuration);
  if (timeout) proxyParams.set('timeout', timeout);
  if (headless) proxyParams.set('headless', headless);

  console.log('🎬 [IMDB-TRAILER] Solicitando stream para:', imdbId, 'prefer:', prefer || '(none)');

  try {
    const response = await fetch(
      `${TRAILER_SERVER_URL}/imdb?${proxyParams.toString()}`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        // Node 18+: timeout de 60s para evitar conexiones colgadas
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(60000) : undefined,
      } as any
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ [IMDB-TRAILER] Error del servidor remoto:', response.status, errorData);
      return NextResponse.json(
        { error: errorData.error || `HTTP ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!data.stream_url) {
      console.warn('⚠️ [IMDB-TRAILER] Respuesta sin stream_url');
    } else {
      console.log(`✅ [IMDB-TRAILER] Recibido: kind=${data.kind} url=${String(data.stream_url).slice(0,80)}...`);
    }

    return NextResponse.json(data);

  } catch (error: any) {
    console.error('❌ [IMDB-TRAILER] Error conectando al servidor remoto:', error);

    return NextResponse.json(
      { error: `Error conectando al servidor de trailers: ${error.message}` },
      { status: 500 }
    );
  }
}