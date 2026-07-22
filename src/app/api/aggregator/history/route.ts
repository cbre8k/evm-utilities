import { NextRequest, NextResponse } from "next/server";
import { getRecentHistory, getComputedMetrics, getMetricsStorageStatus } from "@/lib/metrics/redis";
import { serverError } from '@/lib/api';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('api/aggregator/history');

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const chainIdParam = searchParams.get("chainId");
    const chainId = chainIdParam ? parseInt(chainIdParam, 10) : undefined;

    if (chainIdParam && isNaN(chainId!)) {
      return NextResponse.json({ error: "Invalid chainId parameter" }, { status: 400 });
    }

    const [history, metrics] = await Promise.all([
      getRecentHistory(chainId),
      getComputedMetrics(chainId),
    ]);

    return NextResponse.json({
      history,
      metrics,
      storage: getMetricsStorageStatus(chainId),
    });
  } catch (err) {
    return serverError(log, err);
  }
}
export const dynamic = "force-dynamic";
