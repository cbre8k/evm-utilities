import { NextRequest, NextResponse } from 'next/server';

const BACKENDURL = process.env.BACKENDURL || 'http://localhost:4000';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  const { hash } = await params;
  const res = await fetch(`${BACKENDURL}/share/${hash}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
