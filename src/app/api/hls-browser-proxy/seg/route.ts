import { NextRequest, NextResponse } from 'next/server';
import { fetchSegment } from '@/lib/hlsBrowserProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const urlObj = new URL(req.url);
  const sid = urlObj.searchParams.get('sid');
  const u = urlObj.searchParams.get('u');
  if (!sid || !u) {
    return new NextResponse('missing sid/u', { status: 400 });
  }
  const range = req.headers.get('range') || undefined;
  try {
    const r = await fetchSegment(sid, u, range);
    const headers: Record<string,string> = {
      'cache-control': r.headers['cache-control'] || 'no-cache',
    };
    const pass = ['content-type','content-length','accept-ranges','content-range'];
    for (const k of pass) {
      const v = r.headers[k];
      if (v) headers[k] = v;
    }
    // Convert Buffer to Uint8Array which is a valid BodyInit
    return new NextResponse(new Uint8Array(r.body), { status: r.status, headers });
  } catch (e: any) {
    return new NextResponse(e?.message || 'error', { status: 500 });
  }
}