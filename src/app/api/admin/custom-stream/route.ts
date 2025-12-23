import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { CustomStream } from '@/types/custom-stream';
import { v4 as uuidv4 } from 'uuid';

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

// GET - Listar todos los streams
export async function GET(request: NextRequest) {
  try {
    ensureFileExists();
    
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const tmdbId = searchParams.get('tmdbId');

    const fileContent = fs.readFileSync(CUSTOM_STREAMS_PATH, 'utf-8');
    const data = JSON.parse(fileContent);
    let streams: CustomStream[] = data.streams || [];

    // Filtrar si se proporcionan parámetros
    if (type) {
      streams = streams.filter(s => s.type === type);
    }
    if (tmdbId) {
      streams = streams.filter(s => s.tmdbId === parseInt(tmdbId));
    }

    return NextResponse.json({
      streams,
      total: streams.length
    });
  } catch (error) {
    console.error('Error fetching custom streams:', error);
    return NextResponse.json(
      { error: 'Error al obtener streams' },
      { status: 500 }
    );
  }
}

// POST - Agregar nuevo stream
export async function POST(request: NextRequest) {
  try {
    ensureFileExists();
    
    const body = await request.json();
    const { tmdbId, type, title, streamUrl, language, quality, season, episode, episodeTitle, notes } = body;

    // Validación básica
    if (!tmdbId || !type || !title || !streamUrl || !language) {
      return NextResponse.json(
        { error: 'Campos requeridos: tmdbId, type, title, streamUrl, language' },
        { status: 400 }
      );
    }

    if (type === 'tv' && (season === undefined || episode === undefined)) {
      return NextResponse.json(
        { error: 'Para series se requiere season y episode' },
        { status: 400 }
      );
    }

    // Leer archivo actual
    const fileContent = fs.readFileSync(CUSTOM_STREAMS_PATH, 'utf-8');
    const data = JSON.parse(fileContent);
    const streams: CustomStream[] = data.streams || [];

    // Verificar si ya existe
    const existingIndex = streams.findIndex(s => {
      if (s.type === 'movie') {
        return s.type === type && s.tmdbId === tmdbId;
      } else {
        return s.type === type && s.tmdbId === tmdbId && s.season === season && s.episode === episode;
      }
    });

    const now = new Date().toISOString();
    const newStream: CustomStream = {
      id: uuidv4(),
      tmdbId: parseInt(tmdbId),
      type,
      title,
      streamUrl,
      language,
      quality,
      season: type === 'tv' ? parseInt(season) : undefined,
      episode: type === 'tv' ? parseInt(episode) : undefined,
      episodeTitle,
      notes,
      createdAt: now,
      updatedAt: now
    };

    if (existingIndex >= 0) {
      // Actualizar existente
      newStream.id = streams[existingIndex].id;
      newStream.createdAt = streams[existingIndex].createdAt;
      streams[existingIndex] = newStream;
    } else {
      // Agregar nuevo
      streams.push(newStream);
    }

    // Guardar
    fs.writeFileSync(CUSTOM_STREAMS_PATH, JSON.stringify({ streams }, null, 2));

    return NextResponse.json({
      success: true,
      stream: newStream,
      action: existingIndex >= 0 ? 'updated' : 'created'
    });
  } catch (error) {
    console.error('Error creating custom stream:', error);
    return NextResponse.json(
      { error: 'Error al crear stream' },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar stream
export async function DELETE(request: NextRequest) {
  try {
    ensureFileExists();
    
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Se requiere el ID del stream' },
        { status: 400 }
      );
    }

    // Leer archivo
    const fileContent = fs.readFileSync(CUSTOM_STREAMS_PATH, 'utf-8');
    const data = JSON.parse(fileContent);
    const streams: CustomStream[] = data.streams || [];

    // Filtrar el stream a eliminar
    const filteredStreams = streams.filter(s => s.id !== id);

    if (filteredStreams.length === streams.length) {
      return NextResponse.json(
        { error: 'Stream no encontrado' },
        { status: 404 }
      );
    }

    // Guardar
    fs.writeFileSync(CUSTOM_STREAMS_PATH, JSON.stringify({ streams: filteredStreams }, null, 2));

    return NextResponse.json({
      success: true,
      message: 'Stream eliminado correctamente'
    });
  } catch (error) {
    console.error('Error deleting custom stream:', error);
    return NextResponse.json(
      { error: 'Error al eliminar stream' },
      { status: 500 }
    );
  }
}

