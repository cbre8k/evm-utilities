import { NextResponse } from 'next/server';

const BACKENDURL = process.env.BACKENDURL || 'http://localhost:4000';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chainId: string; address: string }> }
) {
  try {
    const { chainId, address } = await params;
    const res = await fetch(`${BACKENDURL}/etherscan/${chainId}/${address}`, {
      next: { revalidate: 3600 },
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
    console.error('[API Etherscan Error]:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
