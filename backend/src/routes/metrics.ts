import { Router } from 'express';
import { connectMongo } from '../db/mongo';
import { MetricEvent } from '../models/MetricEvent';
import { MetricProviderStat } from '../models/MetricProviderStat';

const router = Router();

const PROVIDERS = ['0x', 'okx', '1inch', 'kyber', 'stormlink', 'lifi'];

type MetricQuote = {
  provider: string;
  chainId: number;
  success: boolean;
  latencyMs: number;
  timeout?: boolean;
  deviationPct?: string;
  deviationAbsPct?: string;
  estimatedGas?: string;
  isBestQuote?: boolean;
  quoteDirection?: 'best' | 'underquote' | 'overquote' | 'equal' | 'failed';
};

type MetricEventBody = {
  id: string;
  createdAt: string;
  chainId: number;
  quotes?: MetricQuote[];
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeMetric(provider: string, raw: Record<string, any>) {
  const totalQuotes = toNumber(raw.totalQuotes);
  const successQuotes = toNumber(raw.successQuotes);
  const failedQuotes = toNumber(raw.failedQuotes);
  const bestQuoteCount = toNumber(raw.bestQuoteCount);
  const timeoutCount = toNumber(raw.timeoutCount);

  return {
    provider,
    totalQuotes,
    successRate: totalQuotes > 0 ? successQuotes / totalQuotes : 0,
    failureRate: totalQuotes > 0 ? failedQuotes / totalQuotes : 0,
    bestQuoteRate: successQuotes > 0 ? bestQuoteCount / successQuotes : 0,
    avgDeviationPct: successQuotes > 0 ? toNumber(raw.deviationSum) / successQuotes : 0,
    avgAbsDeviationPct: successQuotes > 0 ? toNumber(raw.absoluteDeviationSum) / successQuotes : 0,
    avgGas: successQuotes > 0 ? toNumber(raw.gasSum) / successQuotes : 0,
    minGas: raw.gasMin,
    maxGas: raw.gasMax,
    avgLatencyMs: totalQuotes > 0 ? toNumber(raw.latencySum) / totalQuotes : 0,
    minLatencyMs: raw.latencyMin,
    maxLatencyMs: raw.latencyMax,
    timeoutRate: totalQuotes > 0 ? timeoutCount / totalQuotes : 0,
    underquoteCount: toNumber(raw.underquoteCount),
    overquoteCount: toNumber(raw.overquoteCount),
  };
}

async function updateQuoteStats(quote: MetricQuote): Promise<void> {
  const statsKey = {
    chainId: Number(quote.chainId),
    provider: quote.provider,
  };
  const latencyMs = Math.max(0, Math.round(toNumber(quote.latencyMs)));
  const inc: Record<string, number> = {
    totalQuotes: 1,
    latencySum: latencyMs,
  };

  if (quote.success) {
    inc.successQuotes = 1;
    inc.deviationSum = toNumber(quote.deviationPct);
    inc.absoluteDeviationSum = toNumber(quote.deviationAbsPct);

    const gas = quote.estimatedGas ? parseInt(quote.estimatedGas, 10) : undefined;
    if (gas !== undefined && Number.isFinite(gas)) {
      inc.gasSum = gas;
    }

    if (quote.isBestQuote) {
      inc.bestQuoteCount = 1;
    }

    if (quote.quoteDirection === 'overquote') {
      inc.overquoteCount = 1;
    } else if (quote.quoteDirection === 'underquote') {
      inc.underquoteCount = 1;
    } else {
      inc.equalQuoteCount = 1;
    }
  } else {
    inc.failedQuotes = 1;
  }

  if (quote.timeout) {
    inc.timeoutCount = 1;
  }

  await MetricProviderStat.updateOne(
    statsKey,
    {
      $setOnInsert: statsKey,
      $inc: inc,
      $set: { updatedAt: new Date() },
    },
    { upsert: true }
  );

  const stat = await MetricProviderStat.findOne(statsKey);
  if (!stat) return;

  const updates: Record<string, number> = {};
  const gas = quote.success && quote.estimatedGas ? parseInt(quote.estimatedGas, 10) : undefined;
  if (gas !== undefined && Number.isFinite(gas)) {
    if (stat.gasMin === undefined || gas < stat.gasMin) updates.gasMin = gas;
    if (stat.gasMax === undefined || gas > stat.gasMax) updates.gasMax = gas;
  }
  if (stat.latencyMin === undefined || latencyMs < stat.latencyMin) updates.latencyMin = latencyMs;
  if (stat.latencyMax === undefined || latencyMs > stat.latencyMax) updates.latencyMax = latencyMs;

  if (Object.keys(updates).length > 0) {
    await MetricProviderStat.updateOne(statsKey, { $set: updates });
  }
}

router.post('/events', async (req, res, next) => {
  try {
    await connectMongo();

    const event = req.body?.event as MetricEventBody | undefined;
    if (!event?.id || !event.createdAt || !event.chainId) {
      res.status(400).json({ error: 'event.id, event.createdAt, and event.chainId are required' });
      return;
    }

    await MetricEvent.updateOne(
      { id: event.id },
      {
        $set: {
          id: event.id,
          chainId: Number(event.chainId),
          createdAt: new Date(event.createdAt),
          event,
        },
      },
      { upsert: true }
    );

    res.json({ ok: true, storage: { mode: 'mongodb', persistent: true } });
  } catch (err) {
    next(err);
  }
});

router.post('/stats', async (req, res, next) => {
  try {
    await connectMongo();

    const quotes = (Array.isArray(req.body?.quotes) ? req.body.quotes : [req.body?.quote]).filter(Boolean) as MetricQuote[];
    if (quotes.length === 0) {
      res.status(400).json({ error: 'quote or quotes are required' });
      return;
    }

    await Promise.all(quotes.map(updateQuoteStats));
    res.json({ ok: true, storage: { mode: 'mongodb', persistent: true } });
  } catch (err) {
    next(err);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    await connectMongo();

    const chainId = req.query.chainId ? parseInt(String(req.query.chainId), 10) : undefined;
    if (req.query.chainId && !Number.isFinite(chainId)) {
      res.status(400).json({ error: 'Invalid chainId parameter' });
      return;
    }

    const filter = chainId ? { chainId } : {};
    const [events, stats] = await Promise.all([
      MetricEvent.find(filter).sort({ createdAt: -1 }).limit(50).lean(),
      MetricProviderStat.find(filter).lean(),
    ]);

    const statsByProvider = new Map(stats.map((stat) => [stat.provider, stat]));
    const metrics = PROVIDERS.map((provider) => computeMetric(provider, statsByProvider.get(provider) || {}));

    res.json({
      history: events.map((entry) => entry.event),
      metrics,
      storage: {
        mode: 'mongodb',
        persistent: true,
        historyKey: chainId ? `MetricEvent(chainId=${chainId})` : 'MetricEvent',
        statsKeyPattern: chainId
          ? `MetricProviderStat(chainId=${chainId}, provider=<provider>)`
          : 'MetricProviderStat(chainId=<chainId>, provider=<provider>)',
        message: 'Backend MongoDB is configured. Recent logs and leaderboard stats are persistent.',
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
