import { NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/env';
import { serverError } from '@/lib/api';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('api/etherscan');

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chainId: string; address: string }> }
) {
  try {
    const { chainId, address } = await params;
    const res = await fetch(`${BACKEND_URL}/etherscan/${chainId}/${address}`, {
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
    return serverError(log, err);
  }
}
