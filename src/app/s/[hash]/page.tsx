import type { Metadata } from 'next';
import SharePageClient from '@/app/s/[hash]/SharePageClient';
import type { ShareData } from '@/types/share';
import { BACKEND_URL } from '@/lib/env';

async function fetchShare(hash: string): Promise<ShareData | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/share/${hash}`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function previewValue(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

export async function generateMetadata(
  { params }: { params: Promise<{ hash: string }> }
): Promise<Metadata> {
  const { hash } = await params;
  const share = await fetchShare(hash);
  if (!share) {
    return {
      title: 'Share not found | EVM Utilities',
      description: 'This share link is invalid or has been removed.',
    };
  }

  const isTrace = share.type === 'trace';
  const title = isTrace
    ? `Tx ${share.txHash?.slice(0, 10)}… | EVM Explorer`
    : `Simulation ${hash} | EVM Simulator`;

  const description = isTrace
    ? `${share.txOverview?.status?.toUpperCase() ?? ''} · Block ${share.txOverview?.blockNumber ?? ''} · ${share.txOverview?.from?.slice(0, 10)}…`
    : `${share.simulateSuccess ? '✓ Success' : '✖ Failed'} · ${previewValue(share.simulateInputs?.to)}… · Viewed ${share.viewCount} times`;

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function SharePage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const share = await fetchShare(hash);
  return <SharePageClient hash={hash} initialShare={share} />;
}
