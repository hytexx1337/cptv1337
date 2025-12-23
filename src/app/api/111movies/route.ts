import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') || 'movie').toLowerCase();
  const id = searchParams.get('id');
  const season = searchParams.get('season');
  const episode = searchParams.get('episode');

  if (!id) {
    return Response.json({ error: 'Falta parámetro id' }, { status: 400 });
  }

  const isTv = type === 'tv';
  const sourceUrl = isTv
    ? `https://111movies.com/tv/${id}/${season ?? ''}/${episode ?? ''}`
    : `https://111movies.com/movie/${id}`;

  try {
    const res = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        'Referer': 'https://111movies.com/',
        'Cache-Control': 'no-cache',
      },
      // Evitar cache en desarrollo
      cache: 'no-store',
    });

    const statusCode = res.status;
    const html = await res.text();

    // Buscar enlaces HLS (.m3u8)
    const m3u8Regex = /https?:\/\/[^"']+\.m3u8[^"']*/gi;
    const matches = html.match(m3u8Regex) || [];

    if (matches.length > 0) {
      // En muchos sitios el primer match suele ser la playlist principal
      const streamUrl = matches[0];
      return Response.json({ streamUrl, sourceUrl, foundCount: matches.length, statusCode });
    }

    // Responder información útil si estamos rate-limited o bloqueados por Cloudflare
    return Response.json({
      error: 'No se encontró .m3u8 en la página',
      sourceUrl,
      statusCode,
      hint: statusCode === 555 || statusCode === 403 || statusCode === 1015
        ? 'El sitio aplica protección (Cloudflare). Puede requerirse un proxy o cookies válidas.'
        : 'Verifica el id/season/episode o intenta más tarde.'
    }, { status: 404 });
  } catch (err: any) {
    return Response.json({
      error: 'Fallo al obtener la página origen',
      message: err?.message || 'Error desconocido',
      sourceUrl,
    }, { status: 500 });
  }
}