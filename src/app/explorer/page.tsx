import ExplorerClient from './ExplorerClient';
import type { TraceResult } from '@/types/explorer';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

async function fetchTraceResult(shareHash: string): Promise<TraceResult | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/explorer/share/${shareHash}`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function ExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ trace?: string }>;
}) {
  const { trace } = await searchParams;
  const initialResult = trace ? await fetchTraceResult(trace) : null;

  return (
    <ExplorerClient
      initialResult={initialResult}
      initialShareHash={initialResult ? trace : undefined}
    />
  );
}
