// ============================================================
// shared/types/events.ts — Event logs
// ============================================================

export interface EventLog {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
  eventName?: string;
  decoded?: Record<string, string>;
}
