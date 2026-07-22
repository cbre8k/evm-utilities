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
import { createLogger } from '@shared/utils/logger';
import {
  formatPct,
  formatMetricPct,
  formatGasValue,
  formatLatency,
  formatQuoteAmount,
  isValidSimulationResult,
  normalizeProviderKey,
  extractSimulationStage,
  SIM_FAILURE_REASONS,
  HEADER_SLOT_LABELS,
  RADAR_PROVIDER_COLORS,
  type MetricsStorageStatus,
  type SimulationSkip,
  type SimulationResult,
} from './metricsFormat';

const log = createLogger('metrics');

export default function MetricsPage() {
  const { selectedNetwork } = useNetwork();
  const chainId = selectedNetwork?.chainId || 1;

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
  const [headerSlotIndex, setHeaderSlotIndex] = useState<number>(0);
  const [hoveredRadarProvider, setHoveredRadarProvider] = useState<string | null>(null);
  
  // Simulation State
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationStage, setSimulationStage] = useState<string>("IDLE");
  const [simulatedResults, setSimulatedResults] = useState<Record<string, SimulationResult>>({});
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
      log.error("failed to fetch history", err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchHistoryAndStats(chainId);
  }, [chainId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeaderSlotIndex((index) => (index + 1) % HEADER_SLOT_LABELS.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

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
      log.warn("failed to look up token details", err);
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
        setSimulationStage("QUEUE");
        if (data.metrics) {
          setMetrics(data.metrics);
        }
        if (data.storage) {
          setStorageStatus(data.storage);
        }
        
        // ── AUTOMATICALLY RUN SIMULATION IN BACKGROUND ──
        runSimulation(data.event);

      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const runSimulation = async (event: QuoteComparisonEvent) => {
    setIsSimulating(true);
    setSimulationStage("QUEUE");
    setSimulatedResults({});
    setSimulatedProviders(new Set());
    setSkippedSimulation({});

    const parseSimulationResults = (text: string) => {
      const matches = text.matchAll(/\[SIM_RESULT\]\s+provider=([^\s]+)\s+gas=(\d+)\s+output=(\d+)(?:\s+error=([^\n\r"]+))?/g);
      const parsed: Record<string, SimulationResult> = {};

      for (const match of matches) {
        const provider = match[1];
        const normalizedProvider = normalizeProviderKey(provider);
        const result = { gas: match[2], output: match[3], error: match[4] };
        parsed[provider] = result;
        parsed[normalizedProvider] = result;
      }

      return parsed;
    };

    const enrichSimulationResults = (parsed: Record<string, SimulationResult>) => {
      const enriched = { ...parsed };

      for (const quote of event.quotes) {
        const sim = enriched[quote.provider] || enriched[normalizeProviderKey(quote.provider)];
        if (!isValidSimulationResult(sim)) continue;

        const exactOutputRaw = sim.output;
        const quotedOutputRaw = quote.outputAmountRaw;
        let type: QuoteDirection = "equal";
        let simDevPct = "0.0000";

        if (quotedOutputRaw && parseFloat(quotedOutputRaw) !== 0) {
          simDevPct = ((parseFloat(exactOutputRaw) - parseFloat(quotedOutputRaw)) / parseFloat(quotedOutputRaw) * 100).toFixed(4);
          const simVal = new BigNumber(exactOutputRaw);
          const quoteVal = new BigNumber(quotedOutputRaw);
          if (quoteVal.lt(simVal)) type = "underquote";
          else if (quoteVal.gt(simVal)) type = "overquote";
        }

        const gasCostFormatted = quote.gasPriceWei
          ? formatUnits((BigInt(sim.gas) * BigInt(quote.gasPriceWei)).toString(), 18)
          : undefined;

        const result: SimulationResult = {
          ...sim,
          exactQuoteFormatted: formatUnits(exactOutputRaw, event.tokenOutDecimals),
          simDevPct,
          type,
          gasCostFormatted,
        };

        enriched[quote.provider] = result;
        enriched[normalizeProviderKey(quote.provider)] = result;
      }

      return enriched;
    };

    const localSimResults: Record<string, SimulationResult> = {};

    const mergeSimulationResults = (text: string) => {
      const parsed = parseSimulationResults(text);
      if (Object.keys(parsed).length === 0) return;

      const enriched = enrichSimulationResults(parsed);

      Object.assign(localSimResults, enriched);

      setSimulatedResults((prev) => ({
        ...prev,
        ...enriched,
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
          blockNumber: event.blockNumber,
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
        normalizeProviderKey(provider),
      ])));
      setSkippedSimulation(Object.fromEntries(
        skippedProviders.flatMap((skip) => [
          [skip.provider, skip],
          [normalizeProviderKey(skip.provider), skip],
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
              const eventData = JSON.parse(ssePayload) as { status?: string; output?: string; result?: { output?: string } };
              const output = eventData.output || eventData.result?.output || "";
              if (output) {
                setSimulationStage(extractSimulationStage(output));
              } else if (eventData.status === "queued" || eventData.status === "running") {
                setSimulationStage(eventData.status.toUpperCase());
              }
              mergeSimulationResults(output);
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

      // ----------------------------------------------------
      // RECONSTRUCT EVENT WITH TRUE SIMULATED VALUES FOR LOGGING
      // ----------------------------------------------------
      const simulatedQuotesList = event.quotes.map(q => {
        const sim = localSimResults[q.provider] || localSimResults[normalizeProviderKey(q.provider)];
        if (!isValidSimulationResult(sim) || (sim.error && SIM_FAILURE_REASONS.has(sim.error))) {
           return { ...q, success: false };
        }

        const gasCostWei = q.gasPriceWei
          ? (BigInt(sim.gas) * BigInt(q.gasPriceWei)).toString()
          : q.gasCostWei;
        
        return {
          ...q,
          outputAmountRaw: sim.output,
          estimatedGas: sim.gas,
          outputAmountFormatted: formatUnits(sim.output, event.tokenOutDecimals),
          gasCostWei,
          gasCostFormatted: gasCostWei ? formatUnits(gasCostWei, 18) : q.gasCostFormatted,
        };
      });

      const bestOutputRaw = simulatedQuotesList.reduce((max: string | undefined, q) => {
        if (!q.success || !q.outputAmountRaw) return max;
        if (!max) return q.outputAmountRaw;
        return new BigNumber(q.outputAmountRaw).gt(max) ? q.outputAmountRaw : max;
      }, undefined);

      const lowestGasRaw = simulatedQuotesList.reduce((min: string | undefined, q) => {
        if (!q.success || !q.estimatedGas) return min;
        if (!min) return q.estimatedGas;
        return new BigNumber(q.estimatedGas).lt(min) ? q.estimatedGas : min;
      }, undefined);

      const fastestMs = simulatedQuotesList.reduce((min: number | undefined, q) => {
        if (!q.success || !q.latencyMs) return min;
        if (!min) return q.latencyMs;
        return q.latencyMs < min ? q.latencyMs : min;
      }, undefined);

      let baselineOutputRaw: string | undefined;
      if (event.baselineProvider === "best") {
        baselineOutputRaw = bestOutputRaw;
      } else {
        const baselineQuote = simulatedQuotesList.find((q) => q.provider === event.baselineProvider);
        if (baselineQuote?.success) {
          baselineOutputRaw = baselineQuote.outputAmountRaw;
        }
      }

      const finalizedQuotes = simulatedQuotesList.map(q => {
        if (!q.success) return q;
        const deviationPct = bestOutputRaw
          ? ((parseFloat(q.outputAmountRaw || "0") - parseFloat(bestOutputRaw)) / parseFloat(bestOutputRaw) * 100).toFixed(4)
          : "0.0000";
        const deviationVsBaselinePct = baselineOutputRaw
          ? ((parseFloat(q.outputAmountRaw || "0") - parseFloat(baselineOutputRaw)) / parseFloat(baselineOutputRaw) * 100).toFixed(4)
          : undefined;
        let quoteDirection: QuoteDirection = "equal";
        if (bestOutputRaw && q.outputAmountRaw === bestOutputRaw) {
          quoteDirection = "best";
        } else if (baselineOutputRaw) {
          const qVal = new BigNumber(q.outputAmountRaw || "0");
          const bVal = new BigNumber(baselineOutputRaw);
          if (qVal.gt(bVal)) quoteDirection = "overquote";
          else if (qVal.lt(bVal)) quoteDirection = "underquote";
        }

        return {
          ...q,
          deviationPct,
          deviationAbsPct: Math.abs(parseFloat(deviationPct)).toFixed(4),
          deviationVsBaselinePct,
          quoteDirection,
          isBestQuote: bestOutputRaw !== undefined && q.outputAmountRaw === bestOutputRaw,
          isLowestGas: lowestGasRaw !== undefined && q.estimatedGas === lowestGasRaw,
          isFastest: fastestMs !== undefined && q.latencyMs === fastestMs,
        }
      });

      const bestProvider = finalizedQuotes.find((q) => q.isBestQuote)?.provider;
      const lowestGasProvider = finalizedQuotes.find((q) => q.isLowestGas)?.provider;
      const fastestProvider = finalizedQuotes.find((q) => q.isFastest)?.provider;

      const finalizedEvent = {
        ...event,
        bestProvider,
        bestOutputRaw,
        lowestGasProvider,
        fastestProvider,
        quotes: finalizedQuotes,
      };

      const saveRes = await fetch("/api/aggregator/save-sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalizedEvent),
      });

      if (!saveRes.ok) {
        throw new Error(await saveRes.text());
      }

      setSimulationStage("SAVED");
      await fetchHistoryAndStats(event.chainId);

    } catch (err) {
      setSimulationStage("FAILED");
      log.warn("simulation failed", err);
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
    const normalizedProvider = normalizeProviderKey(provider);
    return simulatedResults[normalizedProvider] || simulatedResults[provider];
  };

  const getSimulationStateForProvider = (provider: string) => {
    const normalizedProvider = normalizeProviderKey(provider);
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
      
      const aValidSim = isValidSimulationResult(aSim);
      const bValidSim = isValidSimulationResult(bSim);

      if (a.success !== b.success) return a.success ? -1 : 1;
      if (!a.success || !b.success) return a.latencyMs - b.latencyMs;

      // 1. Strictly prioritize successful simulations over unsimulated/failed ones
      if (aValidSim && !bValidSim) return -1;
      if (!aValidSim && bValidSim) return 1;

      // 2. If both are valid simulations, compare actual simulated output
      if (aValidSim && bValidSim) {
        const outputDelta = new BigNumber(bSim!.output!).comparedTo(aSim!.output!) ?? 0;
        if (outputDelta !== 0) return outputDelta;
      } else {
        // 3. Otherwise (neither simulated or both failed), compare raw quotes
        const outputDelta = new BigNumber(b.outputAmountRaw || 0).comparedTo(a.outputAmountRaw || 0) ?? 0;
        if (outputDelta !== 0) return outputDelta;
      }

      if (a.isLowestGas !== b.isLowestGas) return a.isLowestGas ? -1 : 1;
      return a.latencyMs - b.latencyMs;
    });
  };

  const getExactComparison = (quote: StandardizedQuote) => {
    const simResult = getSimulationResultForProvider(quote.provider);
    if (!isValidSimulationResult(simResult)) {
      return null;
    }

    const exactOutputRaw = simResult.output;
    if (!quote.success || !exactOutputRaw) {
      return null;
    }

    const quotedOutputRaw = quote.outputAmountRaw;
    if (!quotedOutputRaw || parseFloat(quotedOutputRaw) === 0) {
      return {
        simDev: 0,
        exactDirection: "equal" as QuoteDirection,
      };
    }

    const simDev = simResult.simDevPct !== undefined
      ? parseFloat(simResult.simDevPct)
      : ((parseFloat(exactOutputRaw) - parseFloat(quotedOutputRaw)) / parseFloat(quotedOutputRaw) * 100);

    let exactDirection: QuoteDirection = simResult.type || "equal";
    if (!simResult.type) {
      const simVal = new BigNumber(exactOutputRaw);
      const quoteVal = new BigNumber(quotedOutputRaw);
      if (quoteVal.lt(simVal)) exactDirection = "underquote";
      else if (quoteVal.gt(simVal)) exactDirection = "overquote";
    }

    return {
      simDev,
      exactDirection,
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

  const renderSimLoading = (label: string) => (
    <span className={styles.matrixLoading}>
      <span className={styles.inlineBarcode}>
        <BarcodeDeco height={6} />
      </span>
      <SlotStatus text={label} blinkOnSettle={false} />
    </span>
  );

  const renderSimPending = (provider: string, label: string) => {
    const state = getSimulationStateForProvider(provider);
    if (state === "SIM_RUNNING" || state === "SIM_PENDING") {
      return renderSimLoading(label);
    }

    return <span className={styles.pendingExact}>{state}</span>;
  };

  const formatSimGasCost = (quote: StandardizedQuote, simResult?: SimulationResult) => {
    if (simResult?.gasCostFormatted) return simResult.gasCostFormatted;
    if (!isValidSimulationResult(simResult) || !quote.gasPriceWei) return null;
    return formatUnits((BigInt(simResult.gas) * BigInt(quote.gasPriceWei)).toString(), 18);
  };

  return (
    <div className={styles.metricsContainer}>
      <header className={styles.titleHeader}>
        <div className={styles.titleInfo}>
          <h1>DEX AGGREGATOR</h1>
          <SlotStatus
            key={HEADER_SLOT_LABELS[headerSlotIndex]}
            text={HEADER_SLOT_LABELS[headerSlotIndex]}
            className={styles.headerSlotStatus}
            blinkOnSettle={false}
          />
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
              <span className={styles.panelTitle}>[ SWAP_CONFIG ]</span>
              <span className={styles.windowControls}>SYS_SRC // 0XAA [-][+][x]</span>
            </div>
            
            <div className={styles.formBody}>
              <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <Label className={styles.formLabel}>TOKEN_IN (Sell)</Label>
                <div className={styles.tokenQuickSelect}>
                  {(TOKEN_REGISTRY[chainId] || []).slice(1, 5).map((t) => (
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
                <Label className={styles.formLabel}>TOKEN_OUT (Buy)</Label>
                <div className={styles.tokenQuickSelect}>
                  {(TOKEN_REGISTRY[chainId] || []).slice(1, 5).map((t) => (
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
                <Label className={styles.formLabel}>USER_ADDRESS (Optional)</Label>
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
                <>
                  <div className={styles.leaderSummary}>
                    <span>ACTIVE:{sortedMetrics.filter((m) => m.totalQuotes > 0).length}</span>
                    <span>TOP:{leaderProvider?.toUpperCase() || "--"}</span>
                    <span>SLOTS:{AGGREGATOR_PROVIDERS.length}</span>
                  </div>
                  <div className={styles.leaderGrid}>
                    {sortedMetrics.map((m, index) => {
                      const isBestLeader = m.provider === leaderProvider;
                      const bestRatePct = Math.round(m.bestQuoteRate * 100);
                      const successPct = Math.round(m.successRate * 100);
                      const latencyScore = m.totalQuotes > 0
                        ? Math.max(4, Math.round((1 - m.avgLatencyMs / maxLeaderboardLatency) * 100))
                        : 0;
                      const scorePct = Math.round((bestRatePct * 0.45) + (successPct * 0.35) + (latencyScore * 0.2));

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

                          <div className={styles.leaderBody}>
                            <div className={styles.circleGauge} aria-label={`score ${scorePct}%`}>
                              <svg viewBox="0 0 44 44" role="img" aria-hidden="true">
                                <circle className={styles.gaugeTrack} cx="22" cy="22" r="16" pathLength="100" />
                                <circle
                                  className={styles.gaugeValue}
                                  cx="22"
                                  cy="22"
                                  r="16"
                                  pathLength="100"
                                  style={{ strokeDasharray: `${scorePct} 100` }}
                                />
                              </svg>
                              <span>{scorePct}</span>
                            </div>

                            <div className={styles.meterGrid}>
                              <span>BEST</span>
                              <div
                                className={styles.meterTrack}
                                style={{ "--meter": `${bestRatePct}%` } as React.CSSProperties}
                              />
                              <strong>{bestRatePct}%</strong>

                              <span>STEAD</span>
                              <div
                                className={styles.meterTrack}
                                style={{ "--meter": `${successPct}%` } as React.CSSProperties}
                              />
                              <strong>{successPct}%</strong>

                              <span>SWIFT</span>
                              <div
                                className={`${styles.meterTrack} ${styles.meterWarn}`}
                                style={{ "--meter": `${latencyScore}%` } as React.CSSProperties}
                              />
                              <strong>{formatLatency(m.avgLatencyMs)}</strong>
                            </div>
                          </div>

                          <div className={styles.leaderFooter}>
                            <span>Q:{m.totalQuotes}</span>
                            <span>DEV:{formatMetricPct(m.avgAbsDeviationPct)}</span>
                            <span>TO:{formatPct(m.timeoutRate, 0)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className={styles.leaderRadar}>
                    <div className={styles.radarCanvas}>
                      <svg viewBox="0 -10 150 116" role="img" aria-label="Provider radar comparison">
                        <line className={styles.radarAxis} x1="75" y1="58" x2="75" y2="14" />
                        <line className={styles.radarAxis} x1="75" y1="58" x2="113" y2="80" />
                        <line className={styles.radarAxis} x1="75" y1="58" x2="37" y2="80" />
                        <polygon className={styles.radarRing} points="75,14 113,80 37,80" />
                        <text className={styles.radarLabel} x="75" y="9" textAnchor="middle">BEST</text>
                        <text className={styles.radarLabel} x="119" y="88">STEAD</text>
                        <text className={styles.radarLabel} x="31" y="88" textAnchor="end">SWIFT</text>

                        {sortedMetrics.slice(0, AGGREGATOR_PROVIDERS.length).map((m, index) => {
                          const bestRatePct = Math.round(m.bestQuoteRate * 100);
                          const successPct = Math.round(m.successRate * 100);
                          const latencyScore = m.totalQuotes > 0
                            ? Math.max(4, Math.round((1 - m.avgLatencyMs / maxLeaderboardLatency) * 100))
                            : 0;
                          const providerColor = RADAR_PROVIDER_COLORS[index % RADAR_PROVIDER_COLORS.length];
                          const point = (angleDeg: number, value: number) => {
                            const radius = 44 * Math.max(0, Math.min(100, value)) / 100;
                            const angle = angleDeg * Math.PI / 180;
                            return `${75 + Math.cos(angle) * radius},${58 + Math.sin(angle) * radius}`;
                          };
                          const points = [
                            point(-90, bestRatePct),
                            point(30, successPct),
                            point(150, latencyScore),
                          ].join(" ");

                          return (
                            <polygon
                              key={m.provider}
                              points={points}
                              fill={providerColor}
                              stroke={providerColor}
                              className={[
                                styles.radarPoly,
                                hoveredRadarProvider === m.provider ? styles.radarPolyActive : "",
                                hoveredRadarProvider && hoveredRadarProvider !== m.provider ? styles.radarPolyMuted : "",
                              ].filter(Boolean).join(" ")}
                            />
                          );
                        })}
                      </svg>
                    </div>

                    <div className={styles.radarLegend}>
                      {sortedMetrics.slice(0, AGGREGATOR_PROVIDERS.length).map((m, index) => (
                        <span
                          key={m.provider}
                          className={[
                            styles.radarLegendItem,
                            hoveredRadarProvider === m.provider ? styles.radarLegendActive : "",
                          ].filter(Boolean).join(" ")}
                          style={{ color: RADAR_PROVIDER_COLORS[index % RADAR_PROVIDER_COLORS.length] }}
                          onMouseEnter={() => setHoveredRadarProvider(m.provider)}
                          onMouseLeave={() => setHoveredRadarProvider(null)}
                          onFocus={() => setHoveredRadarProvider(m.provider)}
                          onBlur={() => setHoveredRadarProvider(null)}
                          tabIndex={0}
                        >
                          <i className={styles.radarLegendSwatch} aria-hidden="true" />
                          {m.provider.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
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
            <span className={styles.panelTitle}>[ LIVE_QUOTES_COMPARISON ]</span>
            <span className={styles.windowControls}>
              SYS_SRC // 0XAC {isSimulating ? `SIM:${simulationStage}` : "SIM:IDLE"} [-][+][x]
            </span>
          </div>
          <div className={styles.tableWrapper}>
            <table className={`${styles.retroTable} ${styles.table}`}>
              <thead>
                <tr>
                  <th>PROVIDER</th>
                  <th>QUOTE</th>
                  <th>EXACT_QUOTE</th>
                  <th>DEVIATION</th>
                  <th>TYPE</th>
                  <th>GAS</th>
                  <th>GAS_COST</th>
                  <th>LATENCY</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  AGGREGATOR_PROVIDERS.map((prov) => (
                    <tr key={prov} className={styles.loadingRow}>
                      <td><strong className={styles.provTag}>{prov.toUpperCase()}</strong></td>
                      <td colSpan={8} className={styles.loadingQuoteCell}>
                        <span className={styles.loadingCell}>
                          <BarcodeDeco height={8} />
                          <SlotStatus text="QUOTE" blinkOnSettle={false} />
                        </span>
                      </td>
                    </tr>
                  ))
                ) : liveEvent ? (
                  (() => {
                    const rankedQuotes = getRankedQuotes(liveEvent.quotes);
                    const validSimulationRows = rankedQuotes
                      .map((quote) => ({
                        quote,
                        sim: getSimulationResultForProvider(quote.provider),
                      }))
                      .filter((row) => row.quote.success && isValidSimulationResult(row.sim));
                    const simulatedBestProvider = validSimulationRows.reduce<string | undefined>((best, row) => {
                      if (!best) return row.quote.provider;
                      const bestSim = getSimulationResultForProvider(best);
                      return new BigNumber(row.sim!.output).gt(bestSim?.output || "0") ? row.quote.provider : best;
                    }, undefined);
                    const simulatedLowestGasProvider = validSimulationRows.reduce<string | undefined>((best, row) => {
                      if (!best) return row.quote.provider;
                      const bestSim = getSimulationResultForProvider(best);
                      return new BigNumber(row.sim!.gas).lt(bestSim?.gas || "0") ? row.quote.provider : best;
                    }, undefined);

                    return rankedQuotes.map((quote) => {
                    const simResult = getSimulationResultForProvider(quote.provider);
                    const hasValidSimulation = isValidSimulationResult(simResult);
                    const isCurrentBest = quote.provider === simulatedBestProvider;
                    const isLowestSimGas = quote.provider === simulatedLowestGasProvider;
                    const exactComparison = getExactComparison(quote);
                    const gasCostFormatted = formatSimGasCost(quote, simResult);
                    
                    const actualOutFormatted = hasValidSimulation
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
                              {isLowestSimGas && <span className={`${styles.badgeLabel} ${styles.badgeGas}`}>LOW_GAS</span>}
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
                              renderSimPending(quote.provider, "EXACT")
                            )
                          ) : (
                            <span className={styles.textError}>--</span>
                          )}
                        </td>
                        <td className={
                          exactComparison?.simDev !== undefined
                            ? exactComparison.simDev > 0
                              ? styles.textSuccess
                              : exactComparison.simDev < 0
                                ? styles.textError
                                : ""
                            : ""
                        }>
                          {quote.success
                            ? exactComparison
                              ? (exactComparison.simDev === 0 ? "0.0000%" : `${exactComparison.simDev > 0 ? "+" : ""}${exactComparison.simDev.toFixed(4)}%`)
                              : renderSimPending(quote.provider, "DEV")
                            : "--"}
                        </td>
                        <td>
                          {quote.success ? (
                            <div className={styles.directionStack}>
                              <span className={`${styles.dirTag} ${exactComparison ? styles[exactComparison.exactDirection] : styles.equal}`}>
                                {exactComparison ? exactComparison.exactDirection.toUpperCase() : renderSimPending(quote.provider, "TYPE")}
                              </span>
                            </div>
                          ) : (
                            <span className={styles.textError}>FAILED</span>
                          )}
                        </td>
                        <td>
                          {quote.success ? (
                            <div className={styles.gasStack}>
                              {hasValidSimulation ? (
                                <span className={styles.gasActual}>{parseInt(simResult.gas, 10).toLocaleString()} g</span>
                              ) : (
                                renderSimPending(quote.provider, "GAS")
                              )}
                            </div>
                          ) : "--"}
                        </td>
                        <td>
                          {quote.success && gasCostFormatted ? (
                            <span className={styles.gasText}>
                              {parseFloat(gasCostFormatted).toFixed(6)} ETH
                            </span>
                          ) : (
                            quote.success ? renderSimPending(quote.provider, "COST") : "--"
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
                    });
                  })()
                ) : (
                  <tr>
                    <td colSpan={9} className={styles.emptyCell}>
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
            <span className={styles.panelTitle}>[ RECENT_LOGS ]</span>
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
                              <th>PROVIDER</th>
                              <th>EXACT_QUOTE</th>
                              <th>DEVIATION</th>
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
                                    {q.success ? (q.isBestQuote ? "0.0000%" : `${dev.toFixed(4)}%`) : "--"}
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
