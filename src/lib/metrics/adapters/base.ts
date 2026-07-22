import type { QuoteRequest, StandardizedQuote, AggregatorProvider } from "../types";

/**
 * Per-request budget for an aggregator quote. Kept short because quotes are
 * fanned out in parallel and a slow provider must not stall the whole batch.
 */
export const QUOTE_TIMEOUT_MS = 5_000;

export interface QuoteAdapter {
  provider: AggregatorProvider;
  quote(params: QuoteRequest): Promise<StandardizedQuote>;
}
