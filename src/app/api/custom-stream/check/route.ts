import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { CustomStream } from '@/types/custom-stream';

const CUSTOM_STREAMS_PATH = path.join(process.cwd(), 'data', 'custom-streams.json');

// Asegurar que el archivo existe
function ensureFileExists() {
  if (!fs.existsSync(CUSTOM_STREAMS_PATH)) {
    const dir = path.dirname(CUSTOM_STREAMS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CUSTOM_STREAMS_PATH, JSON.stringify({ streams: [] }, null, 2));
  }
}

export async function GET(request: NextRequest) {
  try {
    ensureFileExists();
    
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') as 'movie' | 'tv';
    const tmdbId = parseInt(searchParams.get('id') || '0');
    const season = searchParams.get('season') ? parseInt(searchParams.get('season')!) : undefined;
    const episode = searchParams.get('episode') ? parseInt(searchParams.get('episode')!) : undefined;

    if (!type || !tmdbId) {
      return NextResponse.json(
        { error: 'Parámetros inválidos. Se requiere type e id' },
        { status: 400 }
      );
    }

    // Leer archivo
    const fileContent = fs.readFileSync(CUSTOM_STREAMS_PATH, 'utf-8');
    const data = JSON.parse(fileContent);
    const streams: CustomStream[] = data.streams || [];

    // Buscar stream coincidente
    let matchingStream: CustomStream | null = null;

    if (type === 'movie') {
      matchingStream = streams.find(
        s => s.type === 'movie' && s.tmdbId === tmdbId
      ) || null;
    } else if (type === 'tv') {
      if (season !== undefined && episode !== undefined) {
        matchingStream = streams.find(
          s => s.type === 'tv' && 
               s.tmdbId === tmdbId && 
               s.season === season && 
               s.episode === episode
        ) || null;
      }
    }

    if (matchingStream) {
      return NextResponse.json({
        available: true,
        stream: matchingStream
      });
    } else {
      return NextResponse.json({
        available: false,
        stream: null
      });
    }
  } catch (error) {
    console.error('Error checking custom stream:', error);
    return NextResponse.json(
      { error: 'Error al verificar stream personalizado' },
      { status: 500 }
    );
  }
}

