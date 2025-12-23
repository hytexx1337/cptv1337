import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Proxy para subtítulos de VidLink (megafiles.store)
 * Evita problemas de CORS
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Falta parámetro url' }, { status: 400 });
  }

  // Validar que sea una URL de megafiles.store
  if (!url.includes('megafiles.store')) {
    return NextResponse.json({ error: 'URL no permitida' }, { status: 403 });
  }

  try {
    console.log(`📥 [VIDLINK-SUB-PROXY] Descargando: ${url.substring(0, 60)}...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/vtt,text/plain,*/*',
        'Accept-Charset': 'utf-8',
        'Referer': 'https://vidlink.pro/',
        'Origin': 'https://vidlink.pro'
      }
    });

    if (!response.ok) {
      console.error(`❌ [VIDLINK-SUB-PROXY] Error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Error descargando subtítulo: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Leer como buffer para manejar encoding correctamente
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    const content = decoder.decode(buffer);
    
    console.log(`✅ [VIDLINK-SUB-PROXY] Descargado: ${content.length} caracteres`);
    
    // Asegurar que el VTT tiene el header WEBVTT
    const finalContent = content.startsWith('WEBVTT') ? content : `WEBVTT\n\n${content}`;

    // Retornar con headers CORS correctos y UTF-8
    return new NextResponse(finalContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=86400', // 24 horas
      }
    });
  } catch (error: any) {
    console.error('❌ [VIDLINK-SUB-PROXY] Error:', error);
    return NextResponse.json(
      { error: 'Error descargando subtítulo', message: error.message },
      { status: 500 }
    );
  }
}

