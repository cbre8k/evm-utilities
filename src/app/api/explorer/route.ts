import { NextRequest, NextResponse } from 'next/server';

const BACKENDURL = process.env.BACKENDURL || 'http://localhost:4000';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${BACKENDURL}/explorer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
