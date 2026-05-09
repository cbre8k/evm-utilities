# EVM Utilities — Full Refactoring Plan

> Last updated: 2026-05-09
> Author: @jim
> Status: **IN PROGRESS**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Phase 1 — Shared Package (Types + Utils)](#2-phase-1--shared-package)
3. [Phase 2 — Constants & Configuration](#3-phase-2--constants--configuration)
4. [Phase 3 — Style System Cleanup](#4-phase-3--style-system-cleanup)
5. [Phase 4 — Frontend Component Cleanup](#5-phase-4--frontend-component-cleanup)
6. [Phase 5 — Backend Cleanup](#6-phase-5--backend-cleanup)
7. [Phase 6 — API Route Hardening](#7-phase-6--api-route-hardening)
8. [Completed Tasks](#8-completed-tasks)

---

## 1. Overview

### Goals

- Eliminate duplicated code between frontend and backend
- Centralize all reusable constants (gas costs, chain IDs, RPC URLs, magic numbers)
- Unify type definitions into a single shared source of truth
- Clean up inline hardcoded values (hex colors in TS, magic numbers, timeouts)
- Improve SCSS organization (move opcode colors from TS to design tokens)
- Ensure consistent code patterns and naming conventions

### Architecture After Refactor

```
evm-utilities/
├── shared/                    ← NEW: shared types + utils
│   ├── types/
│   │   ├── trace.ts           ← TraceNode, TraceLog, TraceCallType
│   │   ├── decoded.ts         ← DecodedArg, DecodedCalldata, DecodedOutput
│   │   ├── transaction.ts     ← TxOverview, TokenTransfer
│   │   ├── state.ts           ← AddressStateDiff, StorageChange
│   │   ├── events.ts          ← EventLog, ERC20Transfer, etc.
│   │   ├── job.ts             ← JobStatus
│   │   └── index.ts           ← barrel export
│   ├── utils/
│   │   ├── opcodes.ts         ← merged opcode table (data only, no UI)
│   │   └── sourceMap.ts       ← single copy
│   └── constants/
│       ├── evm.ts             ← gas costs, opcode ranges, PUSH/DUP/SWAP
│       ├── networks.ts        ← chain config, RPC URLs
│       ├── selectors.ts       ← 4byte API, well-known event sigs
│       └── index.ts
├── src/                       ← frontend (unchanged structure)
│   ├── utils/
│   │   └── opcodes.ts         ← UI-only layer (colors, getOpcodeStyle)
│   └── ...
├── backend/                   ← backend (unchanged structure)
│   └── ...
└── ...
```

---

## 2. Phase 1 — Shared Package

> **Goal**: Single source of truth for types and pure utility functions used by both frontend and backend.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Create `shared/` directory structure | ✅ Done | `shared/types/`, `shared/utils/`, `shared/constants/` |
| 1.2 | Extract unified types from `src/types/explorer.ts` + `backend/src/types.ts` | ✅ Done | 7 files in `shared/types/` |
| 1.3 | Consolidate `sourceMap.ts` (identical in frontend + backend) | ✅ Done | `shared/utils/sourceMap.ts` |
| 1.4 | Consolidate `opcodes.ts` data layer | ✅ Done | `shared/utils/opcodes.ts` = data-only (no UI) |
| 1.5 | Keep `src/utils/opcodes.ts` as UI-only layer | ✅ Done | Re-exports data, adds `CATEGORY_COLOR`, `getOpcodeStyle()` |
| 1.6 | Update `backend/src/utils/opcodes.ts` to re-export from shared | ✅ Done | Keeps `INTERESTING_OPS` local |
| 1.7 | Add shared constants | ✅ Done | `networks.ts`, `selectors.ts`, `app.ts` in `shared/constants/` |
| 1.8 | Update `tsconfig.json` paths for both frontend and backend | ✅ Done | `@shared/*` alias added |
| 1.9 | Update all imports + verify builds | ✅ Done | All original files → thin re-export layers; 0 new TS errors |

---

## 3. Phase 2 — Constants & Configuration

> **Goal**: No magic numbers, no hardcoded strings. Every constant has a name.

### 2.1 — EVM Constants (`shared/constants/evm.ts`)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1.1 | Extract EVM gas cost constants | ⬜ Not started | `SLOAD_COLD_GAS = 2100`, `SSTORE_COLD_GAS = 2900`, `SSTORE_SET_GAS = 20000`, `LOG_BASE_GAS = 375`, `LOG_TOPIC_GAS = 375`, `LOG_BYTE_GAS = 8`, `CREATE_GAS = 32000` |
| 2.1.2 | Extract PUSH opcode range constants | ⬜ Not started | `PUSH1_BYTE = 0x60`, `PUSH32_BYTE = 0x7f`, `PUSH0_BYTE = 0x5f` |
| 2.1.3 | Replace hardcoded gas values in `callTraceBuild.ts` | ⬜ Not started | Lines using `375`, `2900`, `2100` |
| 2.1.4 | Replace hardcoded gas values in `backend/src/workers/` | ⬜ Not started | |
| 2.1.5 | Replace PUSH byte ranges in `sourceMap.ts` | ⬜ Not started | `0x60`, `0x7f`, `0x5f` |

### 2.2 — Network Constants (`shared/constants/networks.ts`)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.2.1 | Move `NETWORKS` from `src/lib/constants.ts` to shared | ✅ Done | Done in Phase 1.7 |
| 2.2.2 | Add chain ID mapping | ⬜ Not started | `CHAIN_IDS = { mainnet: 1, bsc: 56, ... }` |
| 2.2.3 | Update `NetworkContext.tsx` imports | ⬜ Not started | |

### 2.3 — API / External Service Constants (`shared/constants/selectors.ts`)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.3.1 | Move `FOURBYTE_API` to shared | ✅ Done | Done in Phase 1.7 |
| 2.3.2 | Extract well-known event signatures | ⬜ Not started | Transfer `0xddf252ad`, Approval `0x8c5be1e5`, etc. Currently hardcoded in `callTraceUtils.ts` |
| 2.3.3 | Move `APP_VERSION`, `AUTHOR`, `GITHUB` to shared | ✅ Done | Done in Phase 1.7 |

### 2.4 — Backend Config Cleanup

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.4.1 | Name TTL constants semantically in `backend/src/config.ts` | ⬜ Not started | `ONE_HOUR = 3600`, `ONE_WEEK = 604800` |
| 2.4.2 | Extract process timeout to named constant | ⬜ Not started | `DEFAULT_PROCESS_TIMEOUT_MS = 120_000` |
| 2.4.3 | Move revalidate `3600` in API routes to constant | ⬜ Not started | `CACHE_REVALIDATE_1H` |

---

## 4. Phase 3 — Style System Cleanup

> **Goal**: All colors in SCSS variables / CSS custom properties. Zero hardcoded hex in `.tsx` files.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | Create `src/styles/_opcode-colors.scss` | ⬜ Not started | CSS custom properties for each opcode category |
| 3.2 | Move `CATEGORY_COLOR` from `opcodes.ts` to CSS variables | ⬜ Not started | `--opc-stop-bg`, `--opc-stop-fg`, etc. |
| 3.3 | Move `OPCODE_COLOR_OVERRIDE` to CSS variables | ⬜ Not started | `--opc-sstore-bg`, `--opc-revert-bg`, etc. |
| 3.4 | Update `getOpcodeStyle()` to read from CSS vars | ⬜ Not started | `getComputedStyle` or pass as props |
| 3.5 | Audit `explorer.module.scss` for inline hex colors | ⬜ Not started | Replace with `var(--color-*)` or `$variable` |
| 3.6 | Audit `global.scss` for theme consistency | ⬜ Not started | Light/dark theme parity check |
| 3.7 | Remove unused SCSS classes | ⬜ Not started | `traceDepthRail` (now replaced by `treeConnector`) |

---

## 5. Phase 4 — Frontend Component Cleanup

> **Goal**: Clean component boundaries, no prop drilling, consistent patterns.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1 | Audit barrel exports (`index.ts`) in component folders | ⬜ Not started | Ensure consistent re-exports |
| 4.2 | Review `ExplorerClient.tsx` for state management patterns | ⬜ Not started | Consider extracting hooks |
| 4.3 | Review `ExplorerResultWorkspace.tsx` for complexity | ⬜ Not started | ~200 lines, may need splitting |
| 4.4 | Clean up `CallTraceTree.tsx` (old component) | ⬜ Not started | May be dead code after tabs refactor |
| 4.5 | Remove any unused imports across all `.tsx` files | ⬜ Not started | ESLint pass |
| 4.6 | Standardize error handling in API routes | ⬜ Not started | Use shared error response helper |

---

## 6. Phase 5 — Backend Cleanup

> **Goal**: Consistent service patterns, no duplicated logic.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1 | Remove `backend/src/utils/opcodes.ts` (use shared) | ✅ Done | Re-export layer + local `INTERESTING_OPS` |
| 5.2 | Remove `backend/src/utils/sourceMap.ts` (use shared) | ✅ Done | Re-export layer |
| 5.3 | Update `backend/src/types.ts` to re-export from shared | ✅ Done | Backend-only types kept local |
| 5.4 | Audit worker files for hardcoded values | ⬜ Not started | Magic numbers in gas estimation |
| 5.5 | Standardize route response format | ⬜ Not started | `{ data, error, meta }` envelope |

---

## 7. Phase 6 — API Route Hardening

> **Goal**: Consistent validation, error schemas, security headers.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.1 | Create shared request validator for API routes | ⬜ Not started | Validate tx hash format, chain ID, etc. |
| 6.2 | Create shared error response builder | ⬜ Not started | `{ error: string, code: number }` |
| 6.3 | Audit rate limiting consistency | ⬜ Not started | Frontend `rate-limit.ts` vs backend middleware |
| 6.4 | Add input sanitization for user-provided RPC URLs | ⬜ Not started | Prevent SSRF via custom RPC |

---

## 8. Completed Tasks

| # | Task | Date | PR/Commit |
|---|------|------|-----------|
| 0.1 | Refactor CallTraceTab — split into 6 modules | 2026-05-08 | — |
| 0.2 | Replace `traceDepthRail` with tree connectors (├─ └─) | 2026-05-08 | — |
| 0.3 | Add `callTraceTypes.ts` | 2026-05-08 | — |
| 0.4 | Add `callTraceBuild.ts` | 2026-05-08 | — |
| 0.5 | Add `callTraceUtils.ts` | 2026-05-08 | — |
| 0.6 | Add `callTraceRows.tsx` | 2026-05-08 | — |
| 0.7 | Add `callTraceInspector.tsx` | 2026-05-08 | — |
| 0.8 | Add `callTraceTree.tsx` | 2026-05-08 | — |
| 1.0 | **Phase 1 — Shared Package** complete | 2026-05-08 | 7 type files, 2 utils, 3 constants, tsconfig paths, re-export layers |

---

## Code Smell Summary (Pre-Refactor Audit)

### Critical (must fix)

| Issue | Location | Impact |
|-------|----------|--------|
| `opcodes.ts` duplicated between frontend + backend | `src/utils/opcodes.ts`, `backend/src/utils/opcodes.ts` | Bug fixes needed in 2 places |
| `sourceMap.ts` duplicated between frontend + backend | `src/utils/sourceMap.ts`, `backend/src/utils/sourceMap.ts` | Identical logic maintained twice |
| Type definitions duplicated | `src/types/explorer.ts`, `backend/src/types.ts` | Drift risk between client/server |
| 13 hardcoded hex colors in `opcodes.ts` | `src/utils/opcodes.ts` | Not theme-aware, bypasses design system |
| Gas costs `375`, `2100`, `2900` hardcoded | `callTraceBuild.ts`, workers | Magic numbers |

### Moderate (should fix)

| Issue | Location | Impact |
|-------|----------|--------|
| PUSH byte ranges `0x60`, `0x7f`, `0x5f` hardcoded | `sourceMap.ts` (both copies) | Obscure magic numbers |
| Event sig hashes hardcoded in utility | `callTraceUtils.ts` | Not discoverable, hard to extend |
| `3600` cache revalidation repeated | Multiple API routes | Should be named constant |
| Rate limit logic duplicated | `src/lib/rate-limit.ts`, `backend/src/middleware/rateLimiter.ts` | Different implementations |
| `FOURBYTE_API` URLs only in frontend | `src/lib/constants.ts` | Backend might need them too |

### Low (nice to have)

| Issue | Location | Impact |
|-------|----------|--------|
| `CallTraceTree.tsx` (old) may be dead code | `src/app/explorer/components/` | Confusion |
| No barrel exports in some component dirs | Various | Inconsistent import patterns |
| Theme fallback uses `@extend` | `global.scss` | SCSS anti-pattern |

---

## Conventions (Post-Refactor)

### Naming

- **Constants**: `UPPER_SNAKE_CASE` (e.g., `SLOAD_COLD_GAS`)
- **Types/Interfaces**: `PascalCase` (e.g., `TraceNode`)
- **Files**: `camelCase.ts` for utils/constants, `PascalCase.tsx` for components
- **SCSS variables**: `$kebab-case` (e.g., `$bg-primary`)
- **CSS custom properties**: `--kebab-case` (e.g., `--opc-call-bg`)

### Imports

- Shared types: `import type { TraceNode } from '@shared/types'`
- Shared utils: `import { getOpcodeInfo } from '@shared/utils/opcodes'`
- Shared constants: `import { SLOAD_COLD_GAS } from '@shared/constants/evm'`
- Frontend UI utils: `import { getOpcodeStyle } from '@/utils/opcodes'`

### File Organization

- One exported component per `.tsx` file
- Barrel `index.ts` in every component directory
- Types co-located only if private to one module; otherwise in `shared/types/`
- Constants in `shared/constants/` unless truly private to one module
