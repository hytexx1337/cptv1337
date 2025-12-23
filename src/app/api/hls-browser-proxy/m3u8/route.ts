import { NextRequest, NextResponse } from 'next/server';
import { fetchPlaylist } from '@/lib/hlsBrowserProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sid = searchParams.get('sid');
  if (!sid) {
    return new NextResponse('missing sid', { status: 400 });
  }
  try {
    const rewritten = await fetchPlaylist(sid);
    return new NextResponse(rewritten, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.apple.mpegurl',
        'cache-control': 'no-cache',
        'pragma': 'no-cache',
      },
    });
  } catch (e: any) {
    return new NextResponse(e?.message || 'error', { status: 500 });
  }
}