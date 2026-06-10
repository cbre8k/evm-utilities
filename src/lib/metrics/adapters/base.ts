import type { QuoteRequest, StandardizedQuote, AggregatorProvider } from "../types";

export interface QuoteAdapter {
  provider: AggregatorProvider;
  quote(params: QuoteRequest): Promise<StandardizedQuote>;
}
