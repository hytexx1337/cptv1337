import { NextRequest, NextResponse } from 'next/server';

const WATCHPARTY_BACKEND = process.env.WATCHPARTY_SERVER_URL || 'https://watchparty.cineparatodos.lat';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '/api/rooms';
    
    const response = await fetch(`${WATCHPARTY_BACKEND}${path}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Watchparty proxy error:', error);
    return NextResponse.json({ error: 'Error contacting watchparty server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '/api/rooms/create';
    const body = await request.json();
    
    const response = await fetch(`${WATCHPARTY_BACKEND}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Watchparty proxy error:', error);
    return NextResponse.json({ error: 'Error contacting watchparty server' }, { status: 500 });
  }
}
