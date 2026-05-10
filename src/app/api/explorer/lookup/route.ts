import { NextRequest, NextResponse } from 'next/server';

const BACKENDURL = process.env.BACKENDURL || 'http://localhost:4000';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.toString();
  const res = await fetch(`${BACKENDURL}/explorer/lookup?${search}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
