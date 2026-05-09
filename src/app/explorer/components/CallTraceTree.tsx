'use client';

import type { TraceNode } from '@/types/explorer';
import CallTraceTab from './tabs/CallTraceTab';

interface Props {
  root: TraceNode;
}

export default function CallTraceTree({ root }: Props) {
  return <CallTraceTab root={root} embedded />;
}
