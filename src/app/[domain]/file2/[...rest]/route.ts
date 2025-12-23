import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function HEAD(req: NextRequest, { params }: { params: { domain: string, rest: string[] } }) {
  try {
    const { domain, rest } = params;
    const target = `https://${domain}/file2/${(rest || []).join('/')}`;
    const proxyUrl = `${req.nextUrl.origin}/api/cors-proxy?url=${encodeURIComponent(target)}&ref=${encodeURIComponent(`https://${domain}/`)}&forceRef=1`;
    const upstream = await fetch(proxyUrl, { method: 'HEAD' });
    const headers = new Headers(upstream.headers);
    return new Response(null, { status: upstream.status, headers });
  } catch (e) {
    return NextResponse.json({ error: 'Proxy route error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: { domain: string, rest: string[] } }) {
  try {
    const { domain, rest } = params;
    const target = `https://${domain}/file2/${(rest || []).join('/')}`;
    const proxyUrl = `${req.nextUrl.origin}/api/cors-proxy?url=${encodeURIComponent(target)}&ref=${encodeURIComponent(`https://${domain}/`)}&forceRef=1`;
    const upstream = await fetch(proxyUrl, { method: 'GET' });
    const headers = new Headers(upstream.headers);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    return NextResponse.json({ error: 'Proxy route error' }, { status: 500 });
  }
}