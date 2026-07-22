import { NextRequest, NextResponse } from "next/server";
import { saveQuoteComparisonEvent, updateProviderStats } from "@/lib/metrics/redis";
import type { QuoteComparisonEvent } from "@/lib/metrics/types";
import { serverError } from '@/lib/api';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('api/aggregator/save-sim');

export async function POST(req: NextRequest) {
  try {
    const event = await req.json() as QuoteComparisonEvent;
    
    if (!event || !event.id || !event.quotes) {
      return NextResponse.json({ error: "Invalid event data" }, { status: 400 });
    }

    // Save finalized event to history
    await saveQuoteComparisonEvent(event);
    
    // Update global provider stats using the finalized quotes
    await Promise.all(event.quotes.map((q) => updateProviderStats(q)));

    return NextResponse.json({ success: true });
  } catch (err) {
    return serverError(log, err);
  }
}
