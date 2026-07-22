// ============================================================
// src/lib/ai.ts — Chat-completions provider resolution
// ============================================================

/** OpenAI-compatible chat-completions endpoints, in priority order. */
const PROVIDERS = [
  { env: 'GITHUB_TOKEN', endpoint: 'https://models.inference.ai.azure.com/chat/completions' },
  { env: 'OPENAI_API_KEY', endpoint: 'https://api.openai.com/v1/chat/completions' },
] as const;

export interface AiProvider {
  endpoint: string;
  token: string;
}

/**
 * Pick the first configured chat-completions provider.
 * GitHub Models is preferred because it needs no separate billing setup.
 * Returns null when no key is present so callers can fall back gracefully.
 */
export function resolveAI(): AiProvider | null {
  for (const { env, endpoint } of PROVIDERS) {
    const token = process.env[env];
    if (token) return { endpoint, token };
  }
  return null;
}
