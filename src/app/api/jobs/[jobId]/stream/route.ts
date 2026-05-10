import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKENDURL = process.env.BACKENDURL || 'http://localhost:4000';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const backendRes = await fetch(`${BACKENDURL}/jobs/${jobId}/stream`, {
    headers: { Accept: 'text/event-stream' },
    signal: req.signal,
  });

  // Proxy the SSE stream directly
  return new Response(backendRes.body, {
    status: backendRes.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
