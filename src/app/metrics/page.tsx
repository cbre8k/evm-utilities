"use client";

import React, { useState, useEffect, useTransition, useMemo } from "react";
import BigNumber from "bignumber.js";
import { parseUnits, formatUnits } from "ethers";
import {
  SlotStatus,
  Button,
  Input,
  Label,
  Status,
  BarcodeDeco,
} from "@/components/ui";
import { TOKEN_REGISTRY, getTokenDetails } from "@/lib/metrics/tokens";
import { AGGREGATOR_PROVIDERS } from "@/lib/metrics/providers";
import styles from "./metrics.module.scss";
import type {
  QuoteComparisonEvent,
  StandardizedQuote,
  ComputedProviderMetrics,
  AggregatorProvider,
  QuoteDirection,
} from "@/lib/metrics/types";
import { useNetwork } from "@/contexts/NetworkContext";

type MetricsStorageStatus = {
  mode: "mongodb" | "redis" | "memory";
  persistent: boolean;
  historyKey: string;
  statsKeyPattern: string;
  message: string;
};

type SimulationSkip = {
  provider: string;
  reason: string;
};

function formatPct(value: number, digits = 1): string {
  return `${Number.isFinite(value) ? (value * 100).toFixed(digits) : "0.0"}%`;
}

function formatMetricPct(value: number, digits = 2): string {
  return `${Number.isFinite(value) ? value.toFixed(digits) : "0.00"}%`;
}

function formatGasValue(value?: string): string {
  if (!value) return "--";
  const gas = parseInt(value, 10);
  return Number.isFinite(gas) ? `${gas.toLocaleString()} g` : "--";
}

function formatLatency(value?: number): string {
  return Number.isFinite(value) ? `${Math.round(value ?? 0)}ms` : "--";
}

function formatQuoteAmount(value?: string): string {
  if (!value) return "--";
  const amount = parseFloat(value);
  if (!Number.isFinite(amount)) return "--";

  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export default function MetricsPage() {
  const { selectedNetwork } = useNetwork();
  const chainIdMap: Record<string, number> = { mainnet: 1, bsc: 56, arbitrum: 42161, optimism: 10, base: 8453 };
  const chainId = chainIdMap[selectedNetwork?.id || "mainnet"] || 1;

  const [tokenInAddress, setTokenInAddress] = useState<string>("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
  const [tokenInSymbol, setTokenInSymbol] = useState<string>("ETH");
  const [tokenInDecimals, setTokenInDecimals] = useState<number>(18);

  const [tokenOutAddress, setTokenOutAddress] = useState<string>("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
  const [tokenOutSymbol, setTokenOutSymbol] = useState<string>("USDC");
  const [tokenOutDecimals, setTokenOutDecimals] = useState<number>(6);

  const [amountIn, setAmountIn] = useState<string>("1.00");
  const [baselineProvider, setBaselineProvider] = useState<AggregatorProvider | "best">("best");
  const [slippageBps, setSlippageBps] = useState<string>("100");
  const [userAddress, setUserAddress] = useState<string>("");

  const [isPending, startTransition] = useTransition();
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Results & History
  const [liveEvent, setLiveEvent] = useState<QuoteComparisonEvent | null>(null);
  const [history, setHistory] = useState<QuoteComparisonEvent[]>([]);
  const [metrics, setMetrics] = useState<ComputedProviderMetrics[]>([]);
  const [storageStatus, setStorageStatus] = useState<MetricsStorageStatus | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const [localBaseline, setLocalBaseline] = useState<AggregatorProvider | "best">("best");
  
  // Simulation State
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulatedResults, setSimulatedResults] = useState<Record<string, { gas: string, output: string, error?: string }>>({});
  const [simulatedProviders, setSimulatedProviders] = useState<Set<string>>(new Set());
  const [skippedSimulation, setSkippedSimulation] = useState<Record<string, SimulationSkip>>({});

  const sortedMetrics = useMemo(() => {
    return [...metrics].sort((a, b) => {
      const aActive = a.totalQuotes > 0 ? 1 : 0;
      const bActive = b.totalQuotes > 0 ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;
      if (b.bestQuoteRate !== a.bestQuoteRate) return b.bestQuoteRate - a.bestQuoteRate;
      if (b.successRate !== a.successRate) return b.successRate - a.successRate;
      if (a.avgAbsDeviationPct !== b.avgAbsDeviationPct) return a.avgAbsDeviationPct - b.avgAbsDeviationPct;
      if (a.avgLatencyMs !== b.avgLatencyMs) return a.avgLatencyMs - b.avgLatencyMs;
      return b.totalQuotes - a.totalQuotes;
    });
  }, [metrics]);

  const leaderProvider = sortedMetrics.find((m) => m.totalQuotes > 0)?.provider;
  const maxLeaderboardLatency = Math.max(
    1,
    ...sortedMetrics
      .filter((m) => m.totalQuotes > 0)
      .map((m) => m.avgLatencyMs)
  );

  // Load history & stats on mount & chainId change
  const fetchHistoryAndStats = async (chain: number) => {
    setIsHistoryLoading(true);
    try {
      const res = await fetch(`/api/aggregator/history?chainId=${chain}`);
      if (!res.ok) {
        throw new Error(`History request failed (${res.status})`);
      }
      const data = await res.json() as {
        history: QuoteComparisonEvent[];
        metrics: ComputedProviderMetrics[];
        storage?: MetricsStorageStatus;
      };
      setHistory((data.history || []).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
      setMetrics(data.metrics || []);
      if (data.storage) {
        setStorageStatus(data.storage);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchHistoryAndStats(chainId);
  }, [chainId]);

  // Update token selections when changing chain
  useEffect(() => {
    const registry = TOKEN_REGISTRY[chainId] || [];
    if (registry.length >= 2) {
      setTokenInAddress(registry[0].address);
      setTokenInSymbol(registry[0].symbol);
      setTokenInDecimals(registry[0].decimals);

      setTokenOutAddress(registry[2]?.address || registry[1].address);
      setTokenOutSymbol(registry[2]?.symbol || registry[1].symbol);
      setTokenOutDecimals(registry[2]?.decimals || registry[1].decimals);
    }
    setLiveEvent(null);
  }, [chainId]);

  // Autodetect token decimals/symbol on manual address input
  const handleAddressBlur = async (type: "in" | "out", address: string) => {
    if (!address || address.length < 10) return;
    try {
      const details = await getTokenDetails(address, chainId);
      if (type === "in") {
        setTokenInSymbol(details.symbol);
        setTokenInDecimals(details.decimals);
      } else {
        setTokenOutSymbol(details.symbol);
        setTokenOutDecimals(details.decimals);
      }
    } catch (err) {
      console.warn("Failed to lookup token details:", err);
    }
  };

  // Run quotes query
  const handleCompare = () => {
    setErrorMsg(null);
    if (!amountIn || isNaN(parseFloat(amountIn)) || parseFloat(amountIn) <= 0) {
      setErrorMsg("Please enter a valid swap amount");
      return;
    }

    startTransition(async () => {
      try {
        const amountInRaw = parseUnits(amountIn, tokenInDecimals).toString();
        const res = await fetch("/api/aggregator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chainId,
            tokenIn: tokenInAddress,
            tokenOut: tokenOutAddress,
            tokenInDecimals,
            tokenOutDecimals,
            amountIn,
            amountInRaw,
            slippageBps: parseInt(slippageBps, 10) || 100,
            userAddress,
            baselineProvider,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || `Server Error ${res.status}`);
        }

        const data = await res.json() as {
          event: QuoteComparisonEvent;
          metrics?: ComputedProviderMetrics[];
          storage?: MetricsStorageStatus;
        };
        setLiveEvent(data.event);
        setSimulatedResults({});
        setSimulatedProviders(new Set());
        setSkippedSimulation({});
        if (data.metrics) {
          setMetrics(data.metrics);
        }
        if (data.storage) {
          setStorageStatus(data.storage);
        }
        
        // ── AUTOMATICALLY RUN SIMULATION IN BACKGROUND ──
        runSimulation(data.event);

        // Refresh history
        await fetchHistoryAndStats(chainId);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const runSimulation = async (event: QuoteComparisonEvent) => {
    setIsSimulating(true);
    setSimulatedResults({});
    setSimulatedProviders(new Set());
    setSkippedSimulation({});

    const parseSimulationResults = (text: string) => {
      const matches = text.matchAll(/\[SIM_RESULT\]\s+provider=([^\s]+)\s+gas=(\d+)\s+output=(\d+)(?:\s+error=([^\n\r"]+))?/g);
      const parsed: Record<string, { gas: string, output: string, error?: string }> = {};

      for (const match of matches) {
        const provider = match[1];
        const normalizedProvider = provider.replace(/[^a-zA-Z0-9]/g, '');
        const result = { gas: match[2], output: match[3], error: match[4] };
        parsed[provider] = result;
        parsed[normalizedProvider] = result;
      }

      return parsed;
    };

    const mergeSimulationResults = (text: string) => {
      const parsed = parseSimulationResults(text);
      if (Object.keys(parsed).length === 0) return;

      setSimulatedResults((prev) => ({
        ...prev,
        ...parsed,
      }));
    };
    
    try {
      const res = await fetch("/api/aggregator/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          tokenIn: event.tokenIn,
          tokenOut: event.tokenOut,
          userAddress: event.userAddress || userAddress || "0x0000000000000000000000000000000000000000",
          quotes: event.quotes,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      const {
        jobId,
        simulatedProviders: plannedProviders = [],
        skippedProviders = [],
      } = await res.json() as {
        jobId: string;
        simulatedProviders?: string[];
        skippedProviders?: SimulationSkip[];
      };
      setSimulatedProviders(new Set(plannedProviders.flatMap((provider) => [
        provider,
        provider.replace(/[^a-zA-Z0-9]/g, ''),
      ])));
      setSkippedSimulation(Object.fromEntries(
        skippedProviders.flatMap((skip) => [
          [skip.provider, skip],
          [skip.provider.replace(/[^a-zA-Z0-9]/g, ''), skip],
        ])
      ));
      const streamRes = await fetch(`/api/jobs/${jobId}/stream`);
      const reader = streamRes.body?.getReader();
      const decoder = new TextDecoder();

      let chunkBuf = "";
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        chunkBuf += decoder.decode(value, { stream: true });

        const lines = chunkBuf.split('\n');
        chunkBuf = lines.pop() || "";

        for (const line of lines) {
          const ssePayload = line.startsWith("data:") ? line.slice(5).trim() : "";
          if (ssePayload) {
            try {
              const eventData = JSON.parse(ssePayload) as { output?: string; result?: { output?: string } };
              mergeSimulationResults(eventData.output || eventData.result?.output || "");
              continue;
            } catch {
              // Fall through to raw text parsing for non-JSON stream chunks.
            }
          }

          mergeSimulationResults(line);
        }
      }

      if (chunkBuf) {
        mergeSimulationResults(chunkBuf);
      }
    } catch (err) {
      console.warn("Simulation failed:", err);
    } finally {
      setIsSimulating(false);
    }
  };

  // Dynamic baseline calculations for UI
  const getRecomputedQuotes = (quotesList: StandardizedQuote[]) => {
    const bestOutputRaw = quotesList.reduce((max: string | undefined, q) => {
      if (!q.success || !q.outputAmountRaw) return max;
      if (!max) return q.outputAmountRaw;
      return new BigNumber(q.outputAmountRaw).gt(max) ? q.outputAmountRaw : max;
    }, undefined);

    let baselineOutputRaw: string | undefined;
    if (localBaseline === "best") {
      baselineOutputRaw = bestOutputRaw;
    } else {
      const baseQuote = quotesList.find((q) => q.provider === localBaseline);
      if (baseQuote?.success) {
        baselineOutputRaw = baseQuote.outputAmountRaw;
      }
    }

    return quotesList.map((q) => {
      if (!q.success || !q.outputAmountRaw) {
        return { ...q, quoteDirection: "failed" as const };
      }

      const isBestQuote = bestOutputRaw !== undefined && q.outputAmountRaw === bestOutputRaw;

      // Deviation vs Best
      const deviationPct = bestOutputRaw
        ? ((parseFloat(q.outputAmountRaw) - parseFloat(bestOutputRaw)) / parseFloat(bestOutputRaw) * 100).toFixed(4)
        : "0.0000";

      // Deviation vs Baseline
      let deviationVsBaselinePct: string | undefined;
      if (baselineOutputRaw) {
        deviationVsBaselinePct = ((parseFloat(q.outputAmountRaw) - parseFloat(baselineOutputRaw)) / parseFloat(baselineOutputRaw) * 100).toFixed(4);
      }

      // Quote Direction
      let quoteDirection: typeof q.quoteDirection = "equal";
      if (localBaseline === "best") {
        quoteDirection = isBestQuote ? "best" : "underquote";
      } else if (baselineOutputRaw) {
        const qVal = new BigNumber(q.outputAmountRaw);
        const bVal = new BigNumber(baselineOutputRaw);
        if (qVal.gt(bVal)) quoteDirection = "overquote";
        else if (qVal.lt(bVal)) quoteDirection = "underquote";
        else quoteDirection = "equal";
      }

      return {
        ...q,
        isBestQuote,
        deviationPct,
        deviationVsBaselinePct,
        quoteDirection,
      };
    });
  };

  const getSimulationResultForProvider = (provider: string) => {
    const normalizedProvider = provider.replace(/[^a-zA-Z0-9]/g, '');
    return simulatedResults[normalizedProvider] || simulatedResults[provider];
  };

  const getSimulationStateForProvider = (provider: string) => {
    const normalizedProvider = provider.replace(/[^a-zA-Z0-9]/g, '');
    const skip = skippedSimulation[normalizedProvider] || skippedSimulation[provider];
    if (skip) return skip.reason.toUpperCase();
    if (getSimulationResultForProvider(provider)) return "EXACT_READY";
    if (simulatedProviders.has(provider) || simulatedProviders.has(normalizedProvider)) {
      return isSimulating ? "SIM_RUNNING" : "SIM_MISSING";
    }
    return isSimulating ? "SIM_PENDING" : "NOT_SIMULATED";
  };

  const getRankedQuotes = (quotesList: StandardizedQuote[]) => {
    return getRecomputedQuotes(quotesList).sort((a, b) => {
      const aSim = getSimulationResultForProvider(a.provider);
      const bSim = getSimulationResultForProvider(b.provider);
      const aOutput = aSim?.output || a.outputAmountRaw;
      const bOutput = bSim?.output || b.outputAmountRaw;

      if (a.success !== b.success) return a.success ? -1 : 1;
      if (!a.success || !b.success) return a.latencyMs - b.latencyMs;
      if (!aOutput && bOutput) return 1;
      if (aOutput && !bOutput) return -1;
      if (aOutput && bOutput) {
        const outputDelta = new BigNumber(bOutput).comparedTo(aOutput) ?? 0;
        if (outputDelta !== 0) return outputDelta;
      }

      if (a.isLowestGas !== b.isLowestGas) return a.isLowestGas ? -1 : 1;
      return a.latencyMs - b.latencyMs;
    });
  };

  const getExactComparison = (quote: StandardizedQuote, quotesList: StandardizedQuote[]) => {
    const simResult = getSimulationResultForProvider(quote.provider);
    const exactOutputRaw = simResult?.output;
    if (!quote.success || !exactOutputRaw) {
      return null;
    }

    const exactOutputs = quotesList
      .map((q) => getSimulationResultForProvider(q.provider)?.output)
      .filter((output): output is string => Boolean(output));

    if (exactOutputs.length === 0) {
      return null;
    }

    const exactBestOutputRaw = exactOutputs.reduce((max, output) => (
      new BigNumber(output).gt(max) ? output : max
    ));

    let exactBaselineOutputRaw: string | undefined;
    if (localBaseline === "best") {
      exactBaselineOutputRaw = exactBestOutputRaw;
    } else {
      exactBaselineOutputRaw = getSimulationResultForProvider(localBaseline)?.output;
    }

    const exactBestDev = exactBestOutputRaw
      ? ((parseFloat(exactOutputRaw) - parseFloat(exactBestOutputRaw)) / parseFloat(exactBestOutputRaw) * 100)
      : 0;

    const exactBaseDev = exactBaselineOutputRaw
      ? ((parseFloat(exactOutputRaw) - parseFloat(exactBaselineOutputRaw)) / parseFloat(exactBaselineOutputRaw) * 100)
      : undefined;

    let exactDirection: QuoteDirection = "equal";
    if (localBaseline === "best") {
      exactDirection = exactOutputRaw === exactBestOutputRaw ? "best" : "underquote";
    } else if (exactBaselineOutputRaw) {
      const exactValue = new BigNumber(exactOutputRaw);
      const baselineValue = new BigNumber(exactBaselineOutputRaw);
      if (exactValue.gt(baselineValue)) exactDirection = "overquote";
      else if (exactValue.lt(baselineValue)) exactDirection = "underquote";
    }

    return {
      exactBestDev,
      exactBaseDev,
      exactDirection,
      isExactBest: exactOutputRaw === exactBestOutputRaw,
    };
  };

  // Quick Token Selection Action
  const selectQuickToken = (type: "in" | "out", token: typeof TOKEN_REGISTRY[1][0]) => {
    if (type === "in") {
      setTokenInAddress(token.address);
      setTokenInSymbol(token.symbol);
      setTokenInDecimals(token.decimals);
    } else {
      setTokenOutAddress(token.address);
      setTokenOutSymbol(token.symbol);
      setTokenOutDecimals(token.decimals);
    }
  };

  const getTokenSymbol = (address: string, chain: number) => {
    const registry = TOKEN_REGISTRY[chain] || [];
    const token = registry.find(t => t.address.toLowerCase() === address.toLowerCase());
    return token ? token.symbol : address.slice(0, 6) + "..." + address.slice(-4);
  };

  return (
    <div className={styles.metricsContainer}>
      <header className={styles.titleHeader}>
        <div className={styles.titleInfo}>
          <h1>DEX AGGREGATOR METRICS</h1>
          <div className={styles.barDeco}>
            <BarcodeDeco />
          </div>
        </div>
        <div className={styles.headerMeta}>
          <span className={storageStatus?.persistent ? styles.storageOk : styles.storageWarn}>
            DB: {storageStatus?.mode.toUpperCase() || "CHECKING"}
          </span>
          <span>CHAIN: {chainId}</span>
        </div>
      </header>

      {storageStatus && !storageStatus.persistent && (
        <div className={styles.storageBanner}>
          <span className={styles.alertDot} />
          <p>
            [ VOLATILE_METRICS ] {storageStatus.message} HISTORY={storageStatus.historyKey} STATS={storageStatus.statsKeyPattern}
          </p>
        </div>
      )}

      {errorMsg && (
        <div className={styles.alertError}>
          <span className={styles.alertDot} />
          <p>ERROR: {errorMsg}</p>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className={styles.mainLayout}>
        {/* LEFT COLUMN: SWAP CONFIG & LEADERBOARD */}
        <div className={styles.leftColumn}>
          {/* SWAP INPUT PANEL */}
          <div className={`${styles.inputPanel} ${styles.terminalWindow}`}>
            <div className={styles.windowHeader}>
              <span className={styles.panelTitle}>[ SWAP CONFIG ]</span>
              <span className={styles.windowControls}>SYS_SRC // 0XAA [-][+][x]</span>
            </div>
            
            <div className={styles.formBody}>
              <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <Label className={styles.formLabel}>TOKEN IN (Sell)</Label>
                <div className={styles.tokenQuickSelect}>
                  {(TOKEN_REGISTRY[chainId] || []).slice(0, 3).map((t) => (
                    <button
                      key={t.address}
                      className={`${styles.quickSelectBtn} ${tokenInAddress.toLowerCase() === t.address.toLowerCase() ? styles.quickActive : ""}`}
                      onClick={() => selectQuickToken("in", t)}
                    >
                      {t.symbol}
                    </button>
                  ))}
                </div>
                <Input
                  value={tokenInAddress}
                  onChange={(e) => setTokenInAddress(e.target.value)}
                  onBlur={() => handleAddressBlur("in", tokenInAddress)}
                  placeholder="Address"
                  suffix={<span className={styles.decimalsBadge}>{tokenInSymbol}</span>}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <Label className={styles.formLabel}>TOKEN OUT (Buy)</Label>
                <div className={styles.tokenQuickSelect}>
                  {(TOKEN_REGISTRY[chainId] || []).slice(1, 4).map((t) => (
                    <button
                      key={t.address}
                      className={`${styles.quickSelectBtn} ${tokenOutAddress.toLowerCase() === t.address.toLowerCase() ? styles.quickActive : ""}`}
                      onClick={() => selectQuickToken("out", t)}
                    >
                      {t.symbol}
                    </button>
                  ))}
                </div>
                <Input
                  value={tokenOutAddress}
                  onChange={(e) => setTokenOutAddress(e.target.value)}
                  onBlur={() => handleAddressBlur("out", tokenOutAddress)}
                  placeholder="Address"
                  suffix={<span className={styles.decimalsBadge}>{tokenOutSymbol}</span>}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <Label className={styles.formLabel}>AMOUNT</Label>
                <Input
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  placeholder="1.0"
                />
              </div>
              <div className={styles.formGroup}>
                <Label className={styles.formLabel}>SLIPPAGE (BPS)</Label>
                <Input
                  value={slippageBps}
                  onChange={(e) => setSlippageBps(e.target.value)}
                  placeholder="100"
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <Label className={styles.formLabel}>BASELINE</Label>
                <div className={styles.baselineGrid}>
                  {[
                    { value: "best", label: "BEST" },
                    ...AGGREGATOR_PROVIDERS.map((provider) => ({
                      value: provider,
                      label: provider.toUpperCase(),
                    })),
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      className={`${styles.quickSelectBtn} ${baselineProvider === opt.value ? styles.quickActive : ""}`}
                      onClick={() => {
                        setBaselineProvider(opt.value as AggregatorProvider | "best");
                        setLocalBaseline(opt.value as AggregatorProvider | "best");
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={`${styles.formRow} ${styles.actionRow}`}>
              <div className={styles.formGroup}>
                <Label className={styles.formLabel}>USER ADDRESS (Optional)</Label>
                <Input
                  value={userAddress}
                  onChange={(e) => setUserAddress(e.target.value)}
                  placeholder="0x..."
                />
              </div>
              <Button
                className={styles.compareBtn}
                onClick={handleCompare}
                disabled={isPending || isSimulating}
              >
                {isPending ? "> FETCH" : isSimulating ? "> SIM" : "> RUN_QUOTE"}
              </Button>
            </div>
            </div>
          </div>

          {/* LEADERBOARD PANEL (MOVED TO LEFT COLUMN) */}
          <div className={`${styles.leaderboardSection} ${styles.terminalWindow}`}>
            <div className={styles.windowHeader}>
              <span className={styles.panelTitle}>[ LEADERBOARD ]</span>
              <span className={styles.windowControls}>
                {`${storageStatus?.mode.toUpperCase() || "CHECK"} // STATS [-][+][x]`}
              </span>
            </div>
            <div className={styles.leaderboardChart}>
              {isHistoryLoading ? (
                <div className={styles.chartLoading}>
                  <BarcodeDeco height={8} />
                  <SlotStatus text="HISTORY" blinkOnSettle={false} />
                </div>
              ) : sortedMetrics.length > 0 ? (
                sortedMetrics.map((m, index) => {
                  const isBestLeader = m.provider === leaderProvider;
                  const bestRatePct = Math.round(m.bestQuoteRate * 100);
                  const successPct = Math.round(m.successRate * 100);
                  const latencyScore = m.totalQuotes > 0
                    ? Math.max(4, Math.round((1 - m.avgLatencyMs / maxLeaderboardLatency) * 100))
                    : 0;

                  return (
                    <div
                      key={m.provider}
                      className={`${styles.leaderCard} ${isBestLeader ? styles.leaderCardActive : ""}`}
                    >
                      <div className={styles.leaderTopline}>
                        <span className={styles.rankTag}>#{index + 1}</span>
                        <strong>{m.provider.toUpperCase()}</strong>
                        {isBestLeader && <span className={styles.badgeLabel}>LEADER</span>}
                      </div>

                      <div className={styles.meterGrid}>
                        <span>BEST</span>
                        <div
                          className={styles.meterTrack}
                          style={{ "--meter": `${bestRatePct}%` } as React.CSSProperties}
                        />
                        <strong>{bestRatePct}%</strong>

                        <span>OK</span>
                        <div
                          className={styles.meterTrack}
                          style={{ "--meter": `${successPct}%` } as React.CSSProperties}
                        />
                        <strong>{successPct}%</strong>

                        <span>FAST</span>
                        <div
                          className={`${styles.meterTrack} ${styles.meterWarn}`}
                          style={{ "--meter": `${latencyScore}%` } as React.CSSProperties}
                        />
                        <strong>{formatLatency(m.avgLatencyMs)}</strong>
                      </div>

                      <div className={styles.leaderFooter}>
                        <span>Q:{m.totalQuotes}</span>
                        <span>DEV:{formatMetricPct(m.avgAbsDeviationPct)}</span>
                        <span>TO:{formatPct(m.timeoutRate, 0)}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.emptyLogs}>[ NO_LEADERBOARD_DATA ]</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE QUOTES & RECENT LOGS */}
        <div className={styles.rightColumn}>
          {/* LIVE QUOTES MATRIX */}
          <div className={`${styles.matrixPanel} ${styles.terminalWindow}`}>
          <div className={styles.windowHeader}>
            <span className={styles.panelTitle}>[ LIVE QUOTES COMPARISON ]</span>
            <span className={styles.windowControls}>SYS_SRC // 0XAC [-][+][x]</span>
          </div>
          <div className={styles.tableWrapper}>
            <table className={`${styles.retroTable} ${styles.table}`}>
              <thead>
                <tr>
                  <th>PROVIDER</th>
                  <th>QUOTE</th>
                  <th>EXACT QUOTE</th>
                  <th>BEST DEV</th>
                  <th>BASE DEV</th>
                  <th>TYPE</th>
                  <th>GAS</th>
                  <th>GAS COST</th>
                  <th>LATENCY</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  AGGREGATOR_PROVIDERS.map((prov) => (
                    <tr key={prov} className={styles.loadingRow}>
                      <td><strong className={styles.provTag}>{prov.toUpperCase()}</strong></td>
                      <td colSpan={9} className={styles.loadingQuoteCell}>
                        <span className={styles.loadingCell}>
                          <BarcodeDeco height={8} />
                          <SlotStatus text="QUOTE" blinkOnSettle={false} />
                        </span>
                      </td>
                    </tr>
                  ))
                ) : liveEvent ? (
                  getRankedQuotes(liveEvent.quotes).map((quote, rankIndex) => {
                    const simResult = getSimulationResultForProvider(quote.provider);
                    const simulationState = getSimulationStateForProvider(quote.provider);
                    const isCurrentBest = quote.success && rankIndex === 0;
                    const exactComparison = getExactComparison(quote, liveEvent.quotes);
                    
                    const actualOutFormatted = simResult?.output 
                      ? formatUnits(simResult.output, tokenOutDecimals) 
                      : null;

                    return (
                      <tr
                        key={quote.provider}
                        className={isCurrentBest ? styles.bestRow : ""}
                      >
                        <td>
                          <div className={styles.providerCell}>
                            <strong className={styles.provTag}>{quote.provider.toUpperCase()}</strong>
                            <span className={styles.providerBadges}>
                              {isCurrentBest && <span className={styles.badgeLabel}>BEST_NOW</span>}
                              {quote.isLowestGas && <span className={`${styles.badgeLabel} ${styles.badgeGas}`}>LOW GAS</span>}
                              {quote.isFastest && <span className={`${styles.badgeLabel} ${styles.badgeFast}`}>FASTEST</span>}
                            </span>
                          </div>
                        </td>
                        <td>
                          {quote.success ? (
                            <div className={styles.quoteStack}>
                              <span>
                                {parseFloat(quote.outputAmountFormatted || "0").toLocaleString(undefined, {
                                  minimumFractionDigits: 4,
                                  maximumFractionDigits: 6,
                                })} {tokenOutSymbol}
                              </span>
                            </div>
                          ) : (
                            <span className={styles.textError}>--</span>
                          )}
                        </td>
                        <td>
                          {quote.success ? (
                            actualOutFormatted ? (
                              <span className={styles.actualLine}>
                                {parseFloat(actualOutFormatted).toLocaleString(undefined, {
                                  minimumFractionDigits: 4,
                                  maximumFractionDigits: 6,
                                })} {tokenOutSymbol}
                              </span>
                            ) : (
                              <span className={styles.pendingExact}>{simulationState}</span>
                            )
                          ) : (
                            <span className={styles.textError}>--</span>
                          )}
                        </td>
                        <td className={exactComparison?.exactBestDev === 0 ? styles.textSuccess : exactComparison ? styles.textError : ""}>
                          {quote.success
                            ? exactComparison
                              ? (exactComparison.exactBestDev === 0 ? "0.00%" : `${exactComparison.exactBestDev.toFixed(2)}%`)
                              : <span className={styles.pendingExact}>{simulationState}</span>
                            : "--"}
                        </td>
                        <td className={
                          exactComparison?.exactBaseDev !== undefined
                            ? exactComparison.exactBaseDev > 0
                              ? styles.textSuccess
                              : exactComparison.exactBaseDev < 0
                                ? styles.textError
                                : ""
                            : ""
                        }>
                          {quote.success
                            ? exactComparison?.exactBaseDev !== undefined
                              ? (exactComparison.exactBaseDev === 0 ? "0.00%" : `${exactComparison.exactBaseDev > 0 ? "+" : ""}${exactComparison.exactBaseDev.toFixed(2)}%`)
                              : <span className={styles.pendingExact}>{simulationState}</span>
                            : "--"}
                        </td>
                        <td>
                          {quote.success ? (
                            <div className={styles.directionStack}>
                              <span className={`${styles.dirTag} ${exactComparison ? styles[exactComparison.exactDirection] : styles.equal}`}>
                                {exactComparison ? exactComparison.exactDirection.toUpperCase() : simulationState}
                              </span>
                              {actualOutFormatted && quote.outputAmountFormatted && (
                                <span className={parseFloat(actualOutFormatted) < parseFloat(quote.outputAmountFormatted) ? styles.actualUnderquote : styles.actualExact}>
                                  {parseFloat(actualOutFormatted) < parseFloat(quote.outputAmountFormatted) ? "UNDERQUOTE" : "EXACT"}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className={styles.textError}>FAILED</span>
                          )}
                        </td>
                        <td>
                          {quote.success ? (
                            <div className={styles.gasStack}>
                              <span>{parseInt(quote.estimatedGas || "0").toLocaleString()} g</span>
                              {simResult && (
                                <div className={styles.gasActual}>
                                  ACTUAL: {parseInt(simResult.gas).toLocaleString()} g
                                </div>
                              )}
                            </div>
                          ) : "--"}
                        </td>
                        <td>
                          {quote.success && quote.gasCostFormatted ? (
                            <span className={styles.gasText}>
                              {parseFloat(quote.gasCostFormatted).toFixed(6)} ETH
                            </span>
                          ) : (
                            "--"
                          )}
                        </td>
                        <td>{quote.latencyMs}ms</td>
                        <td>
                          {simResult ? (
                            simResult.error ? (
                              <Status tone="error">SIM FAIL</Status>
                            ) : (
                              <Status tone="success">VERIFIED</Status>
                            )
                          ) : (
                            <Status tone={quote.success ? "success" : "error"}>
                              {quote.success ? "OK" : quote.timeout ? "TIMEOUT" : "ERROR"}
                            </Status>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className={styles.emptyCell}>
                      [ AWAITING_OPERATOR_INPUT ] RUN_QUOTE_TO_POPULATE_MATRIX
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RECENT SWAP COMPARISON LOGS */}
        <div className={`${styles.historySection} ${styles.terminalWindow}`}>
          <div className={styles.windowHeader}>
            <span className={styles.panelTitle}>[ RECENT LOGS ]</span>
              <span className={styles.windowControls}>
                {storageStatus?.persistent ? storageStatus.historyKey : "MEMORY_BUFFER"} [-][+][x]
              </span>
          </div>
          <div className={styles.historyLogs}>
            {history.length > 0 ? (
              history.map((event) => {
                const isExpanded = expandedHistoryId === event.id;
                const date = new Date(event.createdAt);
                const formattedTime = date.toLocaleTimeString();

                const tokenInSym = getTokenSymbol(event.tokenIn, event.chainId);
                const tokenOutSym = getTokenSymbol(event.tokenOut, event.chainId);
                const bestQuote =
                  event.quotes.find(q => q.provider === event.bestProvider) ||
                  event.quotes.find(q => q.isBestQuote) ||
                  event.quotes.find(q => q.success);
                const winningProvider = event.bestProvider || bestQuote?.provider;
                
                const outAmt = bestQuote?.success && bestQuote.outputAmountFormatted
                  ? formatQuoteAmount(bestQuote.outputAmountFormatted)
                  : "--";

                return (
                  <div key={event.id} className={styles.logRowWrapper}>
                    <div
                      className={styles.logRow}
                      onClick={() => setExpandedHistoryId(isExpanded ? null : event.id)}
                    >
                      <span className={styles.logTime}>{formattedTime}</span>
                      <span className={styles.logPair}>
                        {event.amountIn} {tokenInSym} &rarr; {outAmt} {tokenOutSym}
                      </span>
                      <span className={styles.logBest}>
                        WIN: <strong className={winningProvider ? styles.textSuccess : styles.textError}>{winningProvider?.toUpperCase() || "FAIL"}</strong>
                      </span>
                      <span className={styles.logGas}>
                        GAS: <strong>{bestQuote?.success ? formatGasValue(bestQuote.estimatedGas) : "--"}</strong>
                      </span>
                      <span className={styles.logGas}>
                        LATENCY: <strong>{bestQuote?.success ? formatLatency(bestQuote.latencyMs) : "--"}</strong>
                      </span>
                      <span className={styles.logExpand}>{isExpanded ? "[-]" : "[+]"}</span>
                    </div>

                    {isExpanded && (
                      <div className={styles.logDetails}>
                        <table className={styles.detailsMiniTable}>
                          <thead>
                            <tr>
                              <th>AGG</th>
                              <th>QUOTE AMOUNT</th>
                              <th>DEV</th>
                              <th>GAS</th>
                              <th>LATENCY</th>
                            </tr>
                          </thead>
                          <tbody>
                            {event.quotes.map((q) => {
                              const dev = parseFloat(q.deviationPct || "0");
                              return (
                                <tr key={q.provider} className={q.isBestQuote ? styles.bestRow : ""}>
                                  <td><strong>{q.provider.toUpperCase()}</strong></td>
                                  <td>
                                    {q.success ? (
                                      <span>{formatQuoteAmount(q.outputAmountFormatted)}</span>
                                    ) : (
                                      <span className={styles.textError}>--</span>
                                    )}
                                  </td>
                                  <td className={q.isBestQuote ? styles.textSuccess : styles.textError}>
                                    {q.success ? (q.isBestQuote ? "0.00%" : `${dev.toFixed(2)}%`) : "--"}
                                  </td>
                                  <td>{q.success ? formatGasValue(q.estimatedGas) : "--"}</td>
                                  <td>{formatLatency(q.latencyMs)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className={styles.emptyLogs}>
                {storageStatus?.persistent ? "[ BUFFER_EMPTY ] NO_SWAP_EVENTS_IN_REDIS" : "[ MEMORY_EMPTY ] CONFIGURE_UPSTASH_TO_PERSIST"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
