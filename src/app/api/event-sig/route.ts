// ============================================================
// app/api/event-sig/route.ts
// GET /api/event-sig?topic=0x<64 hex chars>
// Returns the full event signature text (e.g. "Transfer(address,address,uint256)")
// for a given 32-byte topic0 hash, via OpenChain then 4byte fallback.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { FOURBYTE_API, OPENCHAIN_API } from '@shared/constants/selectors';

const LOOKUP_TIMEOUT_MS = 5_000;
const EDGE_CACHE_SECONDS = 86_400; // 24 h — signatures are immutable

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get('topic') ?? '';
  if (!/^0x[0-9a-fA-F]{64}$/.test(topic)) {
    return NextResponse.json({ sig: null }, { status: 400 });
  }
  const t = topic.toLowerCase();

  // 1. OpenChain (preferred — returns full text signature)
  try {
    const res = await fetch(`${OPENCHAIN_API.LOOKUP}?event=${t}&filter=true`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      next: { revalidate: EDGE_CACHE_SECONDS },
    });
    if (res.ok) {
      const data = await res.json() as { result?: { event?: Record<string, Array<{ name: string }>> } };
      const sigs = data?.result?.event?.[t];
      if (Array.isArray(sigs) && sigs.length > 0 && sigs[0].name) {
        return NextResponse.json({ sig: sigs[0].name });
      }
    }
  } catch { /* fall through */ }

  // 2. 4byte / Sourcify fallback
  try {
    const res = await fetch(`${FOURBYTE_API.LOOKUP}?event=${t}`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = await res.json() as { result?: { event?: Record<string, Array<{ name: string }>> } };
      const sigs = data?.result?.event?.[t];
      if (Array.isArray(sigs) && sigs.length > 0 && sigs[0].name) {
        return NextResponse.json({ sig: sigs[0].name });
      }
    }
  } catch { /* fall through */ }

  return NextResponse.json({ sig: null });
}
