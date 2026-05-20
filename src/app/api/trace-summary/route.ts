import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function ruleBased(traceText: string): string {
  const lines = traceText.split('\n').filter(Boolean);
  const callLines = lines.filter((l) => l.match(/^(\s*)(CALL|DELEGATECALL|STATICCALL|CREATE2?)/));
  const revertLines = lines.filter((l) => l.includes('[REVERT:'));
  const contracts = new Set<string>();
  for (const l of lines) {
    const m = l.match(/0x[0-9a-fA-F]{40}/g);
    if (m) m.forEach((a) => contracts.add(a.toLowerCase()));
  }
  const bullets: string[] = [
    `• ${callLines.length} external call(s) detected`,
    `• ${contracts.size} unique contract address(es) involved`,
  ];
  if (revertLines.length > 0) {
    const reasons = revertLines
      .map((l) => { const m = l.match(/\[REVERT: ([^\]]+)\]/); return m?.[1] ?? 'unknown'; })
      .filter((v, i, a) => a.indexOf(v) === i) // dedupe
      .slice(0, 3);
    bullets.push(`• ⚠️ ${revertLines.length} revert(s): ${reasons.join('; ')}`);
  } else {
    bullets.push('• No reverts detected');
  }
  bullets.push('• (AI summary unavailable — set GITHUB_TOKEN or OPENAI_API_KEY for detailed analysis)');
  return bullets.join('\n');
}

// Resolves the API endpoint and auth token.
// Priority: GITHUB_TOKEN (GitHub Models) → OPENAI_API_KEY (OpenAI)
function resolveAI(): { endpoint: string; token: string } | null {
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    return {
      endpoint: 'https://models.inference.ai.azure.com/chat/completions',
      token: githubToken,
    };
  }
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      token: openaiKey,
    };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { traceText, chainId } = await req.json() as { traceText: string; chainId?: number };
  if (!traceText) return NextResponse.json({ error: 'Missing traceText' }, { status: 400 });

  const ai = resolveAI();
  if (ai) {
    try {
      const res = await fetch(ai.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.token}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 256,
          messages: [
            {
              role: 'system',
              content: `You are an EVM transaction analyst. Given a call trace, respond in exactly this format — no extra text:

**Type:** <one-line transaction type, e.g. "ERC-20 transfer", "Uniswap V3 swap", "Aave liquidation">

**What it does:** <2-3 sentences max. Name the specific contracts/protocols. Mention token amounts and direction if visible from events. Be direct.>

**Revert:** <If any [REVERT] in the trace: one sentence explaining which call reverted and the likely reason. If no reverts: "None.">

Do not add any other sections. Be concise and accurate.`,
            },
            {
              role: 'user',
              content: `Chain ID: ${chainId ?? 1}\n\n${traceText}`,
            },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`AI API ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content ?? '';
      return NextResponse.json({ summary: content, source: 'ai' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[trace-summary] AI error:', msg);
      return NextResponse.json({ summary: `⚠ AI error: ${msg}\n\n${ruleBased(traceText)}`, source: 'rule-based' });
    }
  }

  return NextResponse.json({ summary: ruleBased(traceText), source: 'rule-based' });
}
