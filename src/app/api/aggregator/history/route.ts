import { NextRequest, NextResponse } from "next/server";
import { getRecentHistory, getComputedMetrics, getMetricsStorageStatus } from "@/lib/metrics/redis";

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
    console.error("[API Aggregator History] Exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
export const dynamic = "force-dynamic";
