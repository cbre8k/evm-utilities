import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKENDURL = process.env.BACKENDURL || 'http://localhost:4000';

export async function POST(req: NextRequest) {
  const body = await req.json();

  const backendRes = await fetch(`${BACKENDURL}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!backendRes.ok || !backendRes.body) {
    const text = await backendRes.text();
    return NextResponse.json(
      { error: text || 'Backend error' },
      { status: backendRes.status }
    );
  }

  // Stream the response through
  return new NextResponse(backendRes.body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
}
