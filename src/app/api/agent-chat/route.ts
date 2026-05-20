import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Message = { role: 'user' | 'assistant' | 'system'; content: string };

function resolveAI(): { endpoint: string; token: string } | null {
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) return { endpoint: 'https://models.inference.ai.azure.com/chat/completions', token: githubToken };
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) return { endpoint: 'https://api.openai.com/v1/chat/completions', token: openaiKey };
  return null;
}

// ── Action schema injected into system prompt ─────────────────────────────────

const ACTION_SCHEMA = `
You can control the app by appending an <actions> block at the END of your response (never in the middle).
Action format: <actions>[...JSON array of action objects...]</actions>

Available actions:
- {"type":"navigate","page":"/explorer"}  — open the Explorer page
- {"type":"navigate","page":"/"}           — open the Simulator page
- {"type":"navigate","page":"/misc"}       — open the Misc page
- {"type":"switch_network","networkId":"mainnet"} — switch network (ids: mainnet, bsc, arbitrum, optimism, base, viction)
- {"type":"set_tx_hash","hash":"0x..."}    — type a tx hash into the explorer input
- {"type":"execute_trace"}                 — click the Trace button on the explorer
- {"type":"switch_tab","tab":"summary"}    — switch explorer tab (summary, events, state, flow, gas)

INTENT DETECTION — read the user's intent, not just keywords:
- "trace / analyze / investigate / debug / check / look at / show me 0x... on X" → navigate + switch_network + set_tx_hash + execute_trace
- "why did 0x... revert / fail" → navigate + switch_network (if mentioned) + set_tx_hash + execute_trace
- "go to explorer / open explorer" → navigate /explorer
- "switch to BSC / change network to mainnet" → switch_network
- "show gas / open gas tab" → switch_tab gas
- If no tx hash is in the message but user says "investigate this tx" → still emit navigate + execute_trace with whatever hash was previously set

NETWORK NAME MAPPING:
- "ethereum / mainnet / eth" → mainnet
- "bsc / binance / bnb" → bsc
- "arbitrum / arb" → arbitrum
- "optimism / op" → optimism
- "base" → base

RULES:
- Only emit actions when the user wants to DO something (trace a tx, navigate, switch network, etc.)
- For analysis questions on current trace data, answer with text only — no actions
- ALWAYS emit the full chain for "trace X on Y": [navigate /explorer, switch_network Y, set_tx_hash X, execute_trace]
- The <actions> block must be valid JSON — no trailing commas, no comments
`.trim();

const SYSTEM_PROMPT_TRACE = `You are an expert EVM smart contract analyst embedded in a transaction explorer.
You have access to a complete call trace of an Ethereum transaction.
You can summarize the transaction, identify protocols, detect vulnerabilities, advise on gas optimization, explain reverts, and answer questions.
Be concise, technical, and accurate. Use bullet points for lists. Refer to addresses by their label when available.
Always ground your answers in the actual trace data provided.

${ACTION_SCHEMA}`;

const SYSTEM_PROMPT_GENERAL = `You are an expert EVM developer assistant and app controller.
You can help with EVM concepts, Solidity, gas optimization, security, debugging, and transaction analysis.
You can also control the app — navigate pages, switch networks, trace transactions — when the user asks.
Be concise and technical. Use bullet points for lists.

${ACTION_SCHEMA}`;

// ── Action extractor ──────────────────────────────────────────────────────────

function extractActions(text: string): { reply: string; actions: unknown[] } {
  const match = text.match(/<actions>([\s\S]*?)<\/actions>/);
  if (!match) return { reply: text, actions: [] };
  const reply = text.replace(/<actions>[\s\S]*?<\/actions>/, '').trim();
  try {
    const actions = JSON.parse(match[1].trim());
    return { reply, actions: Array.isArray(actions) ? actions : [] };
  } catch {
    return { reply, actions: [] };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    messages: Message[];
    traceContext?: string;
    chainId?: number;
  };

  const { messages, traceContext, chainId } = body;
  if (!messages?.length) {
    return NextResponse.json({ error: 'Missing messages' }, { status: 400 });
  }

  const ai = resolveAI();
  if (!ai) {
    return NextResponse.json({
      reply: '⚠ AI unavailable — set GITHUB_TOKEN or OPENAI_API_KEY.',
      actions: [],
      source: 'unavailable',
    });
  }

  const systemContent = traceContext
    ? `${SYSTEM_PROMPT_TRACE}\n\n=== TRANSACTION CONTEXT (Chain ${chainId ?? 1}) ===\n${traceContext}`
    : SYSTEM_PROMPT_GENERAL;

  const systemMsg: Message = { role: 'system', content: systemContent };

  try {
    const res = await fetch(ai.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.token}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 800,
        messages: [systemMsg, ...messages],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI API ${res.status}: ${txt.slice(0, 200)}`);
    }

    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content ?? '(no response)';
    const { reply, actions } = extractActions(raw);
    return NextResponse.json({ reply, actions, source: 'ai' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent-chat] error:', msg);
    return NextResponse.json({ reply: `⚠ AI error: ${msg}`, actions: [], source: 'error' });
  }
}
