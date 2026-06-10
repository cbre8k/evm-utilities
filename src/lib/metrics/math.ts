import BigNumber from "bignumber.js";
import type { StandardizedQuote, QuoteDirection, AggregatorProvider } from "./types";

/**
 * Finds the best (highest) outputAmountRaw from a list of standardized quotes
 */
export function findBestOutputRaw(quotes: StandardizedQuote[]): string | undefined {
  let bestVal: BigNumber | null = null;
  let bestStr: string | undefined;

  for (const quote of quotes) {
    if (quote.success && quote.outputAmountRaw) {
      const val = new BigNumber(quote.outputAmountRaw);
      if (bestVal === null || val.gt(bestVal)) {
        bestVal = val;
        bestStr = quote.outputAmountRaw;
      }
    }
  }

  return bestStr;
}

/**
 * Computes deviation percentage from target amount to reference amount.
 * Formula: ((target - reference) / reference) * 100
 */
export function calculateDeviationPct(targetRaw: string, referenceRaw: string): string {
  const target = new BigNumber(targetRaw);
  const ref = new BigNumber(referenceRaw);

  if (ref.isZero()) return "0.00";

  // ((target - ref) / ref) * 100
  const dev = target.minus(ref).dividedBy(ref).multipliedBy(100);
  return dev.toFixed(4); // Keep high precision for metrics, UI can format it to 2 decimals
}

/**
 * Determines the direction of the quote compared to the baseline
 */
export function determineQuoteDirection(params: {
  success: boolean;
  outputAmountRaw?: string;
  bestOutputRaw?: string;
  baselineOutputRaw?: string;
  baselineProvider: AggregatorProvider | "best";
}): QuoteDirection {
  const { success, outputAmountRaw, bestOutputRaw, baselineOutputRaw, baselineProvider } = params;

  if (!success || !outputAmountRaw) {
    return "failed";
  }

  if (baselineProvider === "best") {
    if (bestOutputRaw && outputAmountRaw === bestOutputRaw) {
      return "best";
    }
    return "underquote";
  }

  if (!baselineOutputRaw) {
    return "equal";
  }

  const quoteVal = new BigNumber(outputAmountRaw);
  const baseVal = new BigNumber(baselineOutputRaw);

  if (quoteVal.gt(baseVal)) {
    return "overquote";
  } else if (quoteVal.lt(baseVal)) {
    return "underquote";
  } else {
    return "equal";
  }
}
