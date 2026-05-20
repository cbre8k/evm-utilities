import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { traceText, chainId } = await req.json() as { traceText: string; chainId?: number };
  if (!traceText) return NextResponse.json({ error: 'Missing traceText' }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 512,
          messages: [
            {
              role: 'system',
              content:
                'You are an EVM transaction analyst. Given a call trace summary, provide a concise human-readable explanation (3-6 bullet points) of what the transaction does: which contracts were called, what tokens or values were transferred, whether any calls reverted, and the overall purpose. Be terse and technical.',
            },
            {
              role: 'user',
              content: `Chain ID: ${chainId ?? 1}\n\n${traceText}`,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content ?? '';
      return NextResponse.json({ summary: content, source: 'ai' });
    } catch {
      // fall through to rule-based
    }
  }

  // Rule-based fallback
  const lines = traceText.split('\n').filter(Boolean);
  const callLines = lines.filter((l) => l.match(/^(\s*)(CALL|DELEGATECALL|STATICCALL|CREATE2?)/));
  const revertLines = lines.filter((l) => l.includes('[REVERT]') || l.includes('reverted'));
  const contracts = new Set<string>();
  for (const l of lines) {
    const m = l.match(/0x[0-9a-fA-F]{40}/g);
    if (m) m.forEach((a) => contracts.add(a.toLowerCase()));
  }
  const bullets: string[] = [
    `• ${callLines.length} external call(s) detected`,
    `• ${contracts.size} unique contract address(es) involved`,
  ];
  if (revertLines.length > 0) bullets.push(`• ⚠️ ${revertLines.length} revert(s) occurred`);
  else bullets.push('• No reverts detected');
  bullets.push('• (AI summary unavailable — set OPENAI_API_KEY for detailed analysis)');

  return NextResponse.json({ summary: bullets.join('\n'), source: 'rule-based' });
}
