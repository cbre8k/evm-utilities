// ============================================================
// tabs/fundFlowLayout.ts — Pure layout geometry for the fund-flow graph.
// Column/row assignment and edge routing that avoids overlapping nodes.
// Extracted from FundFlowTab.tsx; no React or styling dependencies.
// ============================================================

export type NodeRect = {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** Sample the full double-cubic Bezier path at N points and check if ANY sample hits a node rect. */
export function curveCrossesNode(
  sourceX: number, sourceY: number,
  targetX: number, targetY: number,
  routeY: number,
  rects: NodeRect[], clearance: number,
) {
  // Reproduce the same control-point math used by FlowEdge
  const leftX = Math.min(sourceX, targetX);
  const rightX = Math.max(sourceX, targetX);
  const direction = sourceX <= targetX ? 1 : -1;
  const availableX = Math.max(1, rightX - leftX);
  const edgeGap = Math.min(56, Math.max(20, availableX * 0.16));
  const minX = leftX + edgeGap;
  const maxX = rightX - edgeGap;
  const p1Base = sourceX + direction * availableX * 0.25;
  const p4Base = sourceX + direction * availableX * 0.75;
  const p1X = sourceX <= targetX
    ? Math.min(Math.max(p1Base, minX), maxX)
    : Math.max(Math.min(p1Base, maxX), minX);
  const p4X = sourceX <= targetX
    ? Math.min(Math.max(p4Base, minX), maxX)
    : Math.max(Math.min(p4Base, maxX), minX);
  const midX = (sourceX + targetX) / 2;

  // Sample both cubic segments (source→mid, mid→target)
  const SAMPLES = 12;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const it = 1 - t;
    // First cubic: (sourceX,sourceY) → ctrl(p1X,sourceY) → ctrl(p1X,routeY) → (midX,routeY)
    const x1 = it * it * it * sourceX + 3 * it * it * t * p1X + 3 * it * t * t * p1X + t * t * t * midX;
    const y1 = it * it * it * sourceY + 3 * it * it * t * sourceY + 3 * it * t * t * routeY + t * t * t * routeY;
    // Second cubic: (midX,routeY) → ctrl(p4X,routeY) → ctrl(p4X,targetY) → (targetX,targetY)
    const x2 = it * it * it * midX + 3 * it * it * t * p4X + 3 * it * t * t * p4X + t * t * t * targetX;
    const y2 = it * it * it * routeY + 3 * it * it * t * routeY + 3 * it * t * t * targetY + t * t * t * targetY;

    for (const rect of rects) {
      if (
        x1 > rect.left - clearance && x1 < rect.right + clearance &&
        y1 > rect.top - clearance && y1 < rect.bottom + clearance
      ) return true;
      if (
        x2 > rect.left - clearance && x2 < rect.right + clearance &&
        y2 > rect.top - clearance && y2 < rect.bottom + clearance
      ) return true;
    }
  }
  return false;
}

export function edgeRouteY(
  sourceX: number, sourceY: number,
  targetX: number, targetY: number,
  blockerRects: NodeRect[],
  edgeIndex: number,
) {
  const directY = (sourceY + targetY) / 2;
  const clearance = 40;
  if (!curveCrossesNode(sourceX, sourceY, targetX, targetY, directY, blockerRects, clearance)) return directY;

  const laneStep = 50;
  const sideFirst = edgeIndex % 2 === 0 ? -1 : 1;
  for (let lane = 1; lane <= 14; lane++) {
    const first = directY + sideFirst * lane * laneStep;
    if (!curveCrossesNode(sourceX, sourceY, targetX, targetY, first, blockerRects, clearance)) return first;

    const second = directY - sideFirst * lane * laneStep;
    if (!curveCrossesNode(sourceX, sourceY, targetX, targetY, second, blockerRects, clearance)) return second;
  }

  const leftX = Math.min(sourceX, targetX);
  const rightX = Math.max(sourceX, targetX);
  const crossingRects = blockerRects.filter((rect) => rect.left - clearance < rightX && rect.right + clearance > leftX);
  if (crossingRects.length === 0) return directY;

  const above = Math.min(...crossingRects.map(rect => rect.top)) - clearance - 30;
  const below = Math.max(...crossingRects.map(rect => rect.bottom)) + clearance + 30;
  return Math.abs(above - directY) <= Math.abs(below - directY) ? above : below;
}

// ── Layout: step-based column assignment ──
// Each transfer step places its source and target in successive columns,
// ensuring a strict left-to-right flow that follows transfer order.
export function layeredLayout(
  addresses: string[],
  transfers: { from: string; to: string }[],
): Record<string, { col: number; row: number }> {
  const colOf = new Map<string, number>();

  // Assign columns by processing transfers in order.
  // Each transfer's "from" gets a column if not yet assigned,
  // then "to" is placed at least one column to the right of "from".
  for (const t of transfers) {
    if (!colOf.has(t.from)) {
      // New source node: place in column 0 or find a suitable column
      colOf.set(t.from, 0);
    }
    const fromCol = colOf.get(t.from)!;
    const existing = colOf.get(t.to);
    if (existing === undefined) {
      // New target node: always one column right of its source
      colOf.set(t.to, fromCol + 1);
    } else if (existing <= fromCol) {
      // Target already placed but at same or earlier column — it's a back-edge, keep it
      // Don't move it, the back-edge rendering handles this
    }
  }

  // Assign any unvisited addresses
  for (const a of addresses) {
    if (!colOf.has(a)) colOf.set(a, 0);
  }

  // Group by column
  const colGroups = new Map<number, string[]>();
  for (const a of addresses) {
    const c = colOf.get(a)!;
    if (!colGroups.has(c)) colGroups.set(c, []);
    colGroups.get(c)!.push(a);
  }

  // Build adjacency for barycenter ordering
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const a of addresses) {
    outgoing.set(a, new Set());
    incoming.set(a, new Set());
  }
  for (const t of transfers) {
    outgoing.get(t.from)?.add(t.to);
    incoming.get(t.to)?.add(t.from);
  }

  // Initial row assignment: order by first appearance in transfers
  const firstAppearance = new Map<string, number>();
  transfers.forEach((t, i) => {
    if (!firstAppearance.has(t.from)) firstAppearance.set(t.from, i);
    if (!firstAppearance.has(t.to)) firstAppearance.set(t.to, i);
  });
  for (const [, addrs] of colGroups) {
    addrs.sort((a, b) => (firstAppearance.get(a) ?? 0) - (firstAppearance.get(b) ?? 0));
  }

  // Assign initial row positions
  const rowOf = new Map<string, number>();
  for (const [, addrs] of colGroups) {
    addrs.forEach((a, i) => rowOf.set(a, i));
  }

  // Barycenter heuristic: sweep to minimize crossings
  const sortedCols = [...colGroups.keys()].sort((a, b) => a - b);
  for (let sweep = 0; sweep < 4; sweep++) {
    const cols = sweep % 2 === 0 ? sortedCols : [...sortedCols].reverse();
    for (const col of cols) {
      const addrs = colGroups.get(col)!;
      const bary = new Map<string, number>();
      for (const a of addrs) {
        const neighbors: number[] = [];
        for (const n of outgoing.get(a) ?? []) {
          if (rowOf.has(n)) neighbors.push(rowOf.get(n)!);
        }
        for (const n of incoming.get(a) ?? []) {
          if (rowOf.has(n)) neighbors.push(rowOf.get(n)!);
        }
        if (neighbors.length > 0) {
          bary.set(a, neighbors.reduce((s, v) => s + v, 0) / neighbors.length);
        } else {
          bary.set(a, rowOf.get(a) ?? 0);
        }
      }
      addrs.sort((a, b) => bary.get(a)! - bary.get(b)!);
      addrs.forEach((a, i) => rowOf.set(a, i));
    }
  }

  const positions: Record<string, { col: number; row: number }> = {};
  for (const a of addresses) {
    positions[a] = { col: colOf.get(a)!, row: rowOf.get(a)! };
  }
  return positions;
}
