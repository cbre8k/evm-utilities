import { NextRequest } from 'next/server';
import { BACKEND_URL } from '@/lib/env';

export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

function isExpectedStreamClose(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (!(err instanceof Error)) return false;

  const cause = err.cause as { code?: string } | undefined;
  return (
    err.name === 'AbortError' ||
    err.message === 'terminated' ||
    cause?.code === 'UND_ERR_SOCKET'
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const abortController = new AbortController();

  req.signal.addEventListener('abort', () => {
    abortController.abort();
  }, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const backendRes = await fetch(`${BACKEND_URL}/jobs/${jobId}/stream`, {
          headers: { Accept: 'text/event-stream' },
          signal: abortController.signal,
        });

        if (!backendRes.ok || !backendRes.body) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            status: 'failed',
            error: `Backend job stream failed (${backendRes.status})`,
          })}\n\n`));
          controller.close();
          return;
        }

        const reader = backendRes.body.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }

        controller.close();
      } catch (err) {
        if (!isExpectedStreamClose(err)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
          })}\n\n`));
        }
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
