import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const INTRO_TIMINGS_FILE = path.join(process.cwd(), 'public', 'intro-timings.json');

export async function GET() {
  try {
    const data = await fs.readFile(INTRO_TIMINGS_FILE, 'utf8');
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    // Si el archivo no existe, devolver objeto vacío
    return NextResponse.json({});
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await fs.writeFile(INTRO_TIMINGS_FILE, JSON.stringify(body, null, 2));
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error saving intro timings:', error);
    return NextResponse.json({ error: 'Failed to save intro timings' }, { status: 500 });
  }
}