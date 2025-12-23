import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') || 'movie').toLowerCase();
  const id = searchParams.get('id');
  const season = searchParams.get('season') || undefined;
  const episode = searchParams.get('episode') || undefined;
  const headless = (searchParams.get('headless') || 'true') === 'true';

  if (!id) {
    return NextResponse.json({ error: 'Falta parámetro id' }, { status: 400 });
  }

  const isTv = type === 'tv';
  const sourceUrl = isTv
    ? `https://111movies.com/tv/${id}/${season ?? ''}/${episode ?? ''}`
    : `https://111movies.com/movie/${id}`;

  let browser: any;
  try {
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36',
      viewport: { width: 1366, height: 768 },
    });
    const page = await context.newPage();

    let foundUrl: string | null = null;
    page.on('response', async (response: import('playwright').Response) => {
      const url = response.url();
      if (url.includes('.m3u8') && !foundUrl) {
        foundUrl = url;
      }
    });

    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded' });
    // Intentar disparar reproducción si hay botón
    try { await page.click('.vjs-big-play-button', { timeout: 3000 }); } catch {}
    await page.waitForTimeout(4000);

    if (!foundUrl) {
      try {
        const resp = await page.waitForResponse((r: import('playwright').Response) => r.url().includes('.m3u8'), { timeout: 15000 });
        foundUrl = resp.url();
      } catch {}
    }

    if (!foundUrl) {
      const html = await page.content();
      const matches = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/gi) || [];
      if (matches.length > 0) {
        foundUrl = matches[0];
      }
    }

    await browser.close();

    if (foundUrl) {
      return NextResponse.json({ streamUrl: foundUrl, sourceUrl, type, id, season, episode });
    }

    return NextResponse.json({
      error: 'No se encontró .m3u8',
      hint: 'Pruebe headless=false o interactúe con la página',
      sourceUrl,
    }, { status: 404 });
  } catch (error: any) {
    if (browser) { try { await browser.close(); } catch {} }
    return NextResponse.json({ error: 'Error capturando stream', message: error?.message }, { status: 500 });
  }
}