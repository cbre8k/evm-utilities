import { Redis } from "@upstash/redis";
import type {
  QuoteComparisonEvent,
  StandardizedQuote,
  ProviderStats,
  ComputedProviderMetrics,
} from "./types";
import { AGGREGATOR_PROVIDERS } from "./providers";
import { createLogger } from '@shared/utils/logger';

const log = createLogger('metrics');

/** Budget for a metrics read/write proxied through the Express backend. */
const BACKEND_METRICS_TIMEOUT_MS = 5_000;

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const backendUrl = (process.env.BACKEND_URL || process.env.BACKENDURL || "").replace(/\/$/, "");

export const redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

export type MetricsStorageMode = "mongodb" | "redis" | "memory";

export type MetricsStorageStatus = {
  mode: MetricsStorageMode;
  persistent: boolean;
  historyKey: string;
  statsKeyPattern: string;
  message: string;
};

export function getMetricsStorageStatus(chainId?: number): MetricsStorageStatus {
  const historyKey = chainId ? `metrics:history:${chainId}` : "metrics:history";

  if (backendUrl) {
    return {
      mode: "mongodb",
      persistent: true,
      historyKey: chainId ? `MetricEvent(chainId=${chainId})` : "MetricEvent",
      statsKeyPattern: chainId
        ? `MetricProviderStat(chainId=${chainId}, provider=<provider>)`
        : "MetricProviderStat(chainId=<chainId>, provider=<provider>)",
      message: "Backend MongoDB is configured. Recent logs and leaderboard stats are persistent.",
    };
  }

  if (redis) {
    return {
      mode: "redis",
      persistent: true,
      historyKey,
      statsKeyPattern: chainId
        ? `metrics:stats:${chainId}:<provider>`
        : "metrics:stats:<chainId>:<provider>",
      message: "Upstash Redis is configured. Recent logs and leaderboard stats are persistent.",
    };
  }

  return {
    mode: "memory",
    persistent: false,
    historyKey: "inMemoryHistory",
    statsKeyPattern: "inMemoryStats[metrics:stats:<chainId>:<provider>]",
    message: "UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing. Metrics reset when the server restarts.",
  };
}

async function fetchBackendJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!backendUrl) {
    throw new Error("Backend URL is not configured");
  }

  const res = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(BACKEND_METRICS_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Backend metrics request failed (${res.status})`);
  }

  return (await res.json()) as T;
}

// Fallback in-memory history when Redis is unavailable (dev testing)
const inMemoryHistory: QuoteComparisonEvent[] = [];
const inMemoryStats: Record<string, ProviderStats> = {};

const SUPPORTED_CHAINS = [1, 56, 42161, 10, 8453];
const ACTIVE_PROVIDER_SET = new Set<string>(AGGREGATOR_PROVIDERS);

function filterActiveProviderHistory(events: QuoteComparisonEvent[]): QuoteComparisonEvent[] {
  return events
    .map((event) => ({
      ...event,
      quotes: event.quotes.filter((quote) => ACTIVE_PROVIDER_SET.has(quote.provider)),
    }))
    .filter((event) => event.quotes.length > 0);
}

/**
 * Saves a comparison event to the history list (retaining the latest 50 events)
 */
export async function saveQuoteComparisonEvent(event: QuoteComparisonEvent): Promise<void> {
  if (backendUrl) {
    try {
      await fetchBackendJson("/metrics/events", {
        method: "POST",
        body: JSON.stringify({ event }),
      });
      return;
    } catch (err) {
      log.error("mongo: failed to save quote comparison event", err);
    }
  }

  if (!redis) {
    inMemoryHistory.unshift(event);
    if (inMemoryHistory.length > 50) {
      inMemoryHistory.pop();
    }
    return;
  }

  const globalKey = "metrics:history";
  const chainKey = `metrics:history:${event.chainId}`;
  const serializedEvent = JSON.stringify(event);
  try {
    const pipeline = redis.pipeline();
    pipeline.lpush(globalKey, serializedEvent);
    pipeline.ltrim(globalKey, 0, 49);
    pipeline.lpush(chainKey, serializedEvent);
    pipeline.ltrim(chainKey, 0, 49);
    await pipeline.exec();
  } catch (err) {
    log.error("redis: failed to save quote comparison event", err);
  }
}

/**
 * Updates provider metrics counters in Redis
 */
export async function updateProviderStats(quote: StandardizedQuote): Promise<void> {
  const chainId = quote.chainId;
  const provider = quote.provider;
  const statsKey = `metrics:stats:${chainId}:${provider}`;

  if (backendUrl) {
    try {
      await fetchBackendJson("/metrics/stats", {
        method: "POST",
        body: JSON.stringify({ quote }),
      });
      return;
    } catch (err) {
      log.error("mongo: failed to update provider stats", err);
    }
  }

  if (!redis) {
    // In-memory fallback updates
    const current = inMemoryStats[statsKey] || {
      provider,
      chainId,
      totalQuotes: 0,
      successQuotes: 0,
      failedQuotes: 0,
      bestQuoteCount: 0,
      underquoteCount: 0,
      overquoteCount: 0,
      equalQuoteCount: 0,
      deviationSum: 0,
      absoluteDeviationSum: 0,
      gasSum: 0,
      latencySum: 0,
      timeoutCount: 0,
    };

    current.totalQuotes += 1;
    const lat = quote.latencyMs;
    current.latencySum += lat;
    current.latencyMin = current.latencyMin === undefined ? lat : Math.min(current.latencyMin, lat);
    current.latencyMax = current.latencyMax === undefined ? lat : Math.max(current.latencyMax, lat);

    if (quote.success) {
      current.successQuotes += 1;
      const devPct = parseFloat(quote.deviationPct || "0");
      const devAbsPct = parseFloat(quote.deviationAbsPct || "0");
      current.deviationSum += devPct;
      current.absoluteDeviationSum += devAbsPct;
      if (quote.estimatedGas) {
        const gas = parseInt(quote.estimatedGas, 10);
        if (!isNaN(gas)) {
          current.gasSum += gas;
          current.gasMin = current.gasMin === undefined ? gas : Math.min(current.gasMin, gas);
          current.gasMax = current.gasMax === undefined ? gas : Math.max(current.gasMax, gas);
        }
      }
      if (quote.isBestQuote) current.bestQuoteCount += 1;
      if (quote.quoteDirection === "overquote") current.overquoteCount += 1;
      else if (quote.quoteDirection === "underquote") current.underquoteCount += 1;
      else current.equalQuoteCount += 1;
    } else {
      current.failedQuotes += 1;
    }
    if (quote.timeout) current.timeoutCount += 1;

    inMemoryStats[statsKey] = current;
    return;
  }

  try {
    const pipeline = redis.pipeline();
    pipeline.hincrby(statsKey, "totalQuotes", 1);
    pipeline.hincrby(statsKey, "latencySum", quote.latencyMs);

    if (quote.success) {
      pipeline.hincrby(statsKey, "successQuotes", 1);
      pipeline.hincrbyfloat(statsKey, "deviationSum", parseFloat(quote.deviationPct || "0"));
      pipeline.hincrbyfloat(statsKey, "absoluteDeviationSum", parseFloat(quote.deviationAbsPct || "0"));

      // We'll write latency min/max fields through standard pipeline updates
      if (quote.estimatedGas) {
        const gas = parseInt(quote.estimatedGas, 10);
        if (!isNaN(gas)) {
          pipeline.hincrby(statsKey, "gasSum", gas);
        }
      }

      if (quote.isBestQuote) {
        pipeline.hincrby(statsKey, "bestQuoteCount", 1);
      }

      if (quote.quoteDirection === "overquote") {
        pipeline.hincrby(statsKey, "overquoteCount", 1);
      } else if (quote.quoteDirection === "underquote") {
        pipeline.hincrby(statsKey, "underquoteCount", 1);
      } else {
        pipeline.hincrby(statsKey, "equalQuoteCount", 1);
      }
    } else {
      pipeline.hincrby(statsKey, "failedQuotes", 1);
    }

    if (quote.timeout) {
      pipeline.hincrby(statsKey, "timeoutCount", 1);
    }

    await pipeline.exec();

    // After updating sums, let's update min/max values if necessary.
    // For simplicity, we can fetch the min/max and update them, or do it asynchronously.
    {
      const existing = await redis.hmget<Record<string, string>>(statsKey, "gasMin", "gasMax", "latencyMin", "latencyMax");
      
      const minGas = existing?.gasMin ? parseInt(existing.gasMin, 10) : undefined;
      const maxGas = existing?.gasMax ? parseInt(existing.gasMax, 10) : undefined;
      const minLat = existing?.latencyMin ? parseInt(existing.latencyMin, 10) : undefined;
      const maxLat = existing?.latencyMax ? parseInt(existing.latencyMax, 10) : undefined;

      const newUpdates: Record<string, string | number> = {};
      const gasVal = quote.estimatedGas ? parseInt(quote.estimatedGas, 10) : undefined;

      if (quote.success && gasVal !== undefined && !isNaN(gasVal)) {
        if (minGas === undefined || gasVal < minGas) newUpdates.gasMin = gasVal;
        if (maxGas === undefined || gasVal > maxGas) newUpdates.gasMax = gasVal;
      }

      const latVal = quote.latencyMs;
      if (minLat === undefined || latVal < minLat) newUpdates.latencyMin = latVal;
      if (maxLat === undefined || latVal > maxLat) newUpdates.latencyMax = latVal;

      if (Object.keys(newUpdates).length > 0) {
        await redis.hmset(statsKey, newUpdates);
      }
    }
  } catch (err) {
    log.error("redis: failed to update provider stats", err);
  }
}

/**
 * Returns the recent comparison history
 */
export async function getRecentHistory(chainId?: number): Promise<QuoteComparisonEvent[]> {
  if (backendUrl) {
    try {
      const query = chainId ? `?chainId=${chainId}` : "";
      const data = await fetchBackendJson<{ history: QuoteComparisonEvent[] }>(`/metrics/history${query}`);
      return filterActiveProviderHistory(data.history || []);
    } catch (err) {
      log.error("mongo: failed to load recent history", err);
    }
  }

  if (!redis) {
    const list = [...inMemoryHistory];
    if (chainId) {
      return filterActiveProviderHistory(list.filter((e) => e.chainId === chainId));
    }
    return filterActiveProviderHistory(list);
  }

  try {
    const key = chainId ? `metrics:history:${chainId}` : "metrics:history";
    let rawEvents = await redis.lrange<string>(key, 0, -1);

    if (chainId && rawEvents.length === 0) {
      rawEvents = await redis.lrange<string>("metrics:history", 0, -1);
    }

    const events = rawEvents.map((r) => (typeof r === "string" ? JSON.parse(r) : r) as QuoteComparisonEvent);
    if (chainId) {
      return filterActiveProviderHistory(events.filter((e) => e.chainId === chainId));
    }
    return filterActiveProviderHistory(events);
  } catch (err) {
    log.error("redis: failed to load recent history", err);
    return [];
  }
}

/**
 * Computes stats aggregated over all chains or a single chain
 */
export async function getComputedMetrics(chainId?: number): Promise<ComputedProviderMetrics[]> {
  if (backendUrl) {
    try {
      const query = chainId ? `?chainId=${chainId}` : "";
      const data = await fetchBackendJson<{ metrics: ComputedProviderMetrics[] }>(`/metrics/history${query}`);
      return data.metrics || [];
    } catch (err) {
      log.error("mongo: failed to load computed metrics", err);
    }
  }

  const activeChains = chainId ? [chainId] : SUPPORTED_CHAINS;
  const metricsList: ComputedProviderMetrics[] = [];

  for (const provider of AGGREGATOR_PROVIDERS) {
    let totalQuotes = 0;
    let successQuotes = 0;
    let failedQuotes = 0;
    let bestQuoteCount = 0;
    let underquoteCount = 0;
    let overquoteCount = 0;
    let deviationSum = 0;
    let absoluteDeviationSum = 0;
    let gasSum = 0;
    let latencySum = 0;
    let timeoutCount = 0;
    let minGas: number | undefined;
    let maxGas: number | undefined;
    let minLatencyMs: number | undefined;
    let maxLatencyMs: number | undefined;

    for (const chain of activeChains) {
      const statsKey = `metrics:stats:${chain}:${provider}`;
      
      let rawStats: Record<string, string> | null = null;
      if (!redis) {
        const local = inMemoryStats[statsKey];
        if (local) {
          rawStats = Object.fromEntries(
            Object.entries(local).map(([k, v]) => [k, String(v)])
          ) as Record<string, string>;
        }
      } else {
        try {
          rawStats = await redis.hgetall<Record<string, string>>(statsKey);
        } catch (err) {
          log.error(`redis: failed to load stats for ${statsKey}`, err);
        }
      }

      if (rawStats) {
        totalQuotes += parseInt(rawStats.totalQuotes || "0", 10);
        successQuotes += parseInt(rawStats.successQuotes || "0", 10);
        failedQuotes += parseInt(rawStats.failedQuotes || "0", 10);
        bestQuoteCount += parseInt(rawStats.bestQuoteCount || "0", 10);
        underquoteCount += parseInt(rawStats.underquoteCount || "0", 10);
        overquoteCount += parseInt(rawStats.overquoteCount || "0", 10);
        
        deviationSum += parseFloat(rawStats.deviationSum || "0");
        absoluteDeviationSum += parseFloat(rawStats.absoluteDeviationSum || "0");
        
        gasSum += parseInt(rawStats.gasSum || "0", 10);
        latencySum += parseInt(rawStats.latencySum || "0", 10);
        timeoutCount += parseInt(rawStats.timeoutCount || "0", 10);

        const chainMinGas = rawStats.gasMin ? parseInt(rawStats.gasMin, 10) : undefined;
        const chainMaxGas = rawStats.gasMax ? parseInt(rawStats.gasMax, 10) : undefined;
        const chainMinLat = rawStats.latencyMin ? parseInt(rawStats.latencyMin, 10) : undefined;
        const chainMaxLat = rawStats.latencyMax ? parseInt(rawStats.latencyMax, 10) : undefined;

        if (chainMinGas !== undefined) {
          minGas = minGas === undefined ? chainMinGas : Math.min(minGas, chainMinGas);
        }
        if (chainMaxGas !== undefined) {
          maxGas = maxGas === undefined ? chainMaxGas : Math.max(maxGas, chainMaxGas);
        }
        if (chainMinLat !== undefined) {
          minLatencyMs = minLatencyMs === undefined ? chainMinLat : Math.min(minLatencyMs, chainMinLat);
        }
        if (chainMaxLat !== undefined) {
          maxLatencyMs = maxLatencyMs === undefined ? chainMaxLat : Math.max(maxLatencyMs, chainMaxLat);
        }
      }
    }

    if (totalQuotes === 0) {
      // Default placeholder metrics for uncalled aggregators
      metricsList.push({
        provider,
        totalQuotes: 0,
        successRate: 0,
        failureRate: 0,
        bestQuoteRate: 0,
        avgDeviationPct: 0,
        avgAbsDeviationPct: 0,
        avgGas: 0,
        avgLatencyMs: 0,
        timeoutRate: 0,
        underquoteCount: 0,
        overquoteCount: 0,
      });
      continue;
    }

    metricsList.push({
      provider,
      totalQuotes,
      successRate: totalQuotes > 0 ? successQuotes / totalQuotes : 0,
      failureRate: totalQuotes > 0 ? failedQuotes / totalQuotes : 0,
      bestQuoteRate: successQuotes > 0 ? bestQuoteCount / successQuotes : 0,
      avgDeviationPct: successQuotes > 0 ? deviationSum / successQuotes : 0,
      avgAbsDeviationPct: successQuotes > 0 ? absoluteDeviationSum / successQuotes : 0,
      avgGas: successQuotes > 0 ? gasSum / successQuotes : 0,
      minGas,
      maxGas,
      avgLatencyMs: totalQuotes > 0 ? latencySum / totalQuotes : 0,
      minLatencyMs,
      maxLatencyMs,
      timeoutRate: totalQuotes > 0 ? timeoutCount / totalQuotes : 0,
      underquoteCount,
      overquoteCount,
    });
  }

  return metricsList;
}
