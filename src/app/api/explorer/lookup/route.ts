import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/env';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.toString();
  const res = await fetch(`${BACKEND_URL}/explorer/lookup?${search}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
