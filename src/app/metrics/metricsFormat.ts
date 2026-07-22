// ============================================================
// metrics/metricsFormat.ts — Formatting helpers, shared types and display
// constants for the metrics dashboard. Extracted from page.tsx.
// ============================================================

import type { QuoteDirection } from "@/lib/metrics/types";

export type MetricsStorageStatus = {
  mode: "mongodb" | "redis" | "memory";
  persistent: boolean;
  historyKey: string;
  statsKeyPattern: string;
  message: string;
};

export type SimulationSkip = {
  provider: string;
  reason: string;
};

export type SimulationResult = {
  gas: string;
  output: string;
  error?: string;
  exactQuoteFormatted?: string;
  simDevPct?: string;
  type?: QuoteDirection;
  gasCostFormatted?: string;
};

export const SIM_FAILURE_REASONS = new Set([
  "revert",
  "exception",
  "approve_failed",
  "build_failed",
  "missing_calldata",
]);

export const HEADER_SLOT_LABELS = ["METRICS", "BENCHMARKS", "STATISTICS", "ANALYTICS"];
export const RADAR_PROVIDER_COLORS = ["#8aff80", "#7df9ff", "#f5c542", "#ff4d4d"];

export function formatPct(value: number, digits = 1): string {
  return `${Number.isFinite(value) ? (value * 100).toFixed(digits) : "0.0"}%`;
}

export function formatMetricPct(value: number, digits = 2): string {
  return `${Number.isFinite(value) ? value.toFixed(digits) : "0.00"}%`;
}

export function formatGasValue(value?: string): string {
  if (!value) return "--";
  const gas = parseInt(value, 10);
  return Number.isFinite(gas) ? `${gas.toLocaleString()} g` : "--";
}

export function formatLatency(value?: number): string {
  return Number.isFinite(value) ? `${Math.round(value ?? 0)}ms` : "--";
}

export function formatQuoteAmount(value?: string): string {
  if (!value) return "--";
  const amount = parseFloat(value);
  if (!Number.isFinite(amount)) return "--";

  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function isValidSimulationResult(result?: SimulationResult): result is SimulationResult {
  return !!result && !result.error && result.output !== "0" && result.gas !== "0";
}

export function normalizeProviderKey(provider: string): string {
  return provider.replace(/[^a-zA-Z0-9]/g, '');
}

export function extractSimulationStage(output: string): string {
  const plain = output.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
  if (plain.includes("[SIM_RESULT]")) return "RESULTS";
  if (plain.includes("[TRACE_CALL_MANY] simulate")) return "TRACE";
  if (plain.includes("[TRACE_CALL_MANY] rpc=")) return "RPC";
  if (plain.includes("Compiler run successful")) return "RUNNING";
  if (plain.includes("Compiling") || plain.includes("[FOUNDRY] compile_and_test_started")) return "COMPILE";
  if (plain.includes("[FOUNDRY] spawn")) return "SPAWN";
  if (plain.includes("[FOUNDRY] workspace_init")) return "WORKSPACE";
  return "QUEUE";
}
