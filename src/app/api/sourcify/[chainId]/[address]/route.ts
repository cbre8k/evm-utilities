import { NextResponse } from 'next/server';

const BACKENDURL = process.env.BACKENDURL || 'http://localhost:4000';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chainId: string; address: string }> }
) {
  try {
    const { chainId, address } = await params;
    
    // Proxy to the backend sourcify service
    const res = await fetch(`${BACKENDURL}/sourcify/${chainId}/${address}`, {
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Contract not verified or backend error' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[API Sourcify Error]:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
