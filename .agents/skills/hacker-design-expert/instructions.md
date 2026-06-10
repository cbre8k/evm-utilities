---

name: hacker-design-expert
description: Core UI/UX engineering skill for building retro, brutalist, high-contrast terminal-style interfaces with monospace typography, ASCII decorations, scanline effects, rigid layouts, and cyberpunk data-dashboard patterns.
risk: safe
source: community
date_added: "2026-06-08"
------------------------

# Retro Hacker UI & Brutalist Design Expert

## When to Use

Use this skill when the task explicitly asks for one or more of these styles:

* Hacker UI
* Retro terminal UI
* Brutalist web design
* Cyberpunk dashboard
* CLI-inspired web app
* High-contrast monochrome interface
* ASCII-heavy interface
* Vintage OS / CRT / command-line aesthetic
* Security dashboard / on-chain attack dashboard / exploit analysis UI
* Web3 scanner, forensic dashboard, transaction tracer, or threat-monitoring product

Do **not** use this skill for soft, friendly, luxury, glassmorphism, neumorphism, corporate SaaS, pastel, lifestyle, or rounded-card interfaces unless the user explicitly asks to mix styles.

---

## Role Overview

You are a world-class UI/UX Engineer specializing in **Hacker Aesthetic Design**.

Your goal is to create interfaces that feel like:

* a terminal workspace,
* a vintage operating system,
* a cyber-security operations center,
* a brutalist data dashboard,
* a blockchain forensic tool,
* or an underground hacker zine.

You prioritize:

* rigid visual hierarchy,
* high information density,
* sharp geometry,
* strong typography,
* scanline / ASCII / binary decorations,
* functional data presentation,
* and a strong “machine interface” feeling.

The UI should feel engineered, not decorated.

---

## Preferred Tech Stack

Unless instructed otherwise, default to:

* **Framework:** React / Next.js
* **Styling:** Tailwind CSS
* **Typography:** Monospace only
* **Animation:** CSS keyframes or lightweight React state
* **Icons:** Prefer ASCII, Unicode symbols, Lucide icons only if needed
* **Charts:** SVG / CSS / simple canvas-style visuals
* **Layout:** CSS Grid and Flexbox

Preferred fonts:

* JetBrains Mono
* Fira Code
* Space Mono
* IBM Plex Mono
* Geist Mono
* `font-mono` fallback

Avoid:

* Inter
* Roboto
* SF Pro
* Poppins
* rounded modern SaaS typography

---

## Core Design Principles

### 1. High Contrast, Eye-Safe

Use strong contrast, but avoid harsh pure black and pure white when possible.

Recommended palette:

```txt
BACKGROUND_BASE     #0C100C
BACKGROUND_PANEL    #101510
BACKGROUND_RAISED   #151A15
TEXT_PRIMARY        #E5E5E5
TEXT_MUTED          #9CA39C
TEXT_DIM            #6B726B
BORDER_PRIMARY      #D8D8D8
BORDER_MUTED        #3A423A
DANGER              #FF4D4D
WARNING             #F5C542
SUCCESS             #7CFF6B
ACCENT_GREEN        #8AFF80
ACCENT_CYAN         #7DF9FF
```

Use monochrome as the default. Accent colors should be rare and meaningful.

Color rules:

* Green = live / active / success / terminal status
* Red = danger / exploit / failed / destructive
* Yellow = warning / pending / suspicious
* Cyan = links / references / selected technical metadata
* Gray = muted / inactive / archived

Avoid gradients, glass effects, soft shadows, pastel colors, and glossy buttons.

---

### 2. Monospace Everything

All UI text must use monospace typography.

This includes:

* headings,
* body text,
* numbers,
* buttons,
* labels,
* tables,
* inputs,
* tooltips,
* charts,
* badges,
* timestamps.

Typography should feel like output from a machine.

Recommended text treatment:

```txt
HEADINGS: uppercase, tracked, compact
BODY: short technical phrases
LABELS: bracketed, e.g. [ STATUS ], [ TX HASH ], [ PAYLOAD ]
NUMBERS: tabular alignment
BUTTONS: command-style, e.g. EXECUTE_SCAN, OPEN_TRACE, COPY_HASH
```

---

### 3. Rigid Geometry

Use sharp edges everywhere.

Rules:

* `rounded-none`
* hard borders
* visible grid structure
* no soft cards
* no floating modern panels
* no glassmorphism
* no blurry shadows

Preferred structure:

```txt
+------------------------------------------------+
| [ MODULE: TRACE_VIEWER ]                 [-][x] |
+------------------------------------------------+
| BLOCK: 19028410                                |
| HASH : 0xA13F...91BC                           |
| GAS  : 184,220 / 300,000                       |
+------------------------------------------------+
```

---

### 4. Terminal Window Frames

Most major content blocks should be wrapped inside terminal-like frames.

Each frame should include:

* title bar,
* module label,
* optional status indicator,
* window controls: `[-] [+] [x]`,
* bordered body,
* footer metadata when useful.

Example title patterns:

```txt
[ ROOT::DASHBOARD ]
[ TRACE_VIEWER.EXE ]
[ MEMORY_DUMP_04 ]
[ NODE_STATUS ]
[ EXPLOIT_ANALYSIS ]
```

---

### 5. Dense & Segmented Layouts

The UI should look like a heavily customized `tmux`, `vim`, or SOC dashboard.

Use:

* split panels,
* sidebars,
* tab strips,
* data cells,
* status bars,
* command palettes,
* logs,
* tables,
* grid overlays.

Avoid excessive empty whitespace.

If space is empty, fill it with:

* binary strings,
* coordinates,
* ASCII grids,
* checksum text,
* fake terminal logs,
* small metadata blocks,
* wireframe diagrams,
* barcode-like separators,
* hash fragments,
* block numbers,
* or scanline patterns.

---

## Layout Rules

### Page Composition

Recommended app shell:

```txt
+--------------------------------------------------------------+
| HEADER: PROJECT_NAME        STATUS: ONLINE        18:42:09    |
+-------------------+------------------------------------------+
| SIDEBAR           | MAIN PANEL                               |
| - NAV             | +--------------------------------------+ |
| - MODULES         | | ACTIVE WINDOW                        | |
| - SYSTEM STATUS   | |                                      | |
|                   | +--------------------------------------+ |
+-------------------+------------------------------------------+
| FOOTER: CHAIN_ID / BLOCK / RPC / LATENCY / VERSION           |
+--------------------------------------------------------------+
```

### Grid Rules

Use CSS Grid for dashboard layouts.

Recommended columns:

* 12-column grid for full pages
* 2-column split for editor / preview
* 3-column split for dashboards
* fixed sidebar + flexible main content
* bottom status bar always visible for tool-like apps

### Borders

Borders should define structure.

Use:

* `border`
* `border-2`
* `border-dashed`
* `border-dotted`
* pseudo-elements for extended crosshair lines

Avoid:

* floating cards without borders
* large empty cards
* invisible section separation

### Hanging Labels

Place labels so they intersect with borders.

Example:

```tsx
<div className="relative border border-zinc-300 p-4">
  <span className="absolute -top-3 left-3 bg-[#0C100C] px-2 text-xs">
    [ ACTIVE_TRACE ]
  </span>
</div>
```

---

## Component Patterns

### 1. TerminalWindow

Use for all primary modules.

Required props:

```ts
type TerminalWindowProps = {
  title: string;
  status?: "online" | "offline" | "warning" | "error";
  children: React.ReactNode;
  footer?: React.ReactNode;
};
```

Visual rules:

* hard border,
* title bar,
* window controls,
* no rounded corners,
* compact padding,
* status indicator in title bar.

---

### 2. BinaryDeco

Reusable decorative component for binary strings.

Rules:

* Do not hardcode random binary everywhere.
* Use a component to generate or repeat binary text.
* Keep it decorative and low-contrast.

Example content:

```txt
01001000 01000001 01000011 01001011
```

---

### 3. AsciiDivider

Use instead of modern dividers.

Examples:

```txt
+------------------------------+
///// SYSTEM TRACE /////
[::::::::::::::::::::::::::::::]
<><><><><><><><><><><><><><><>
```

---

### 4. StatusBadge

Badges should look like terminal states.

Examples:

```txt
[ ONLINE ]
[ FAILED ]
[ SYNCING ]
[ REVERTED ]
[ CONFIRMED ]
[ UNVERIFIED ]
[ HIGH_RISK ]
```

Rules:

* uppercase only,
* bracketed text,
* no pill shape,
* no rounded corners.

---

### 5. CommandButton

Buttons should feel like terminal commands.

Examples:

```txt
> RUN_SCAN
> DECODE_INPUT
> COPY_HASH
> OPEN_TRACE
> EXPORT_LOG
```

Button rules:

* uppercase,
* monospace,
* sharp border,
* instant hover,
* no smooth transition,
* hover can invert foreground/background,
* disabled state should look like unavailable terminal command.

---

### 6. DataTable

Tables are central to hacker-style dashboards.

Rules:

* compact row height,
* visible column borders,
* sticky headers,
* tabular numbers,
* truncated hashes,
* copy buttons for hashes,
* row hover should snap instantly,
* selected row should invert or use hard outline.

Recommended columns for blockchain/security UI:

```txt
[IDX] [TYPE] [FROM] [TO] [VALUE] [GAS] [STATUS] [RISK]
```

---

### 7. LogStream

Use for live events, traces, command output, and diagnostics.

Example:

```txt
[18:42:01] INIT::CONNECT_RPC endpoint=mainnet
[18:42:02] TRACE::LOAD_TX hash=0x91a...
[18:42:03] EVM::REVERT selector=0x08c379a0
[18:42:04] STATUS::FAILED reason="INSUFFICIENT_OUTPUT"
```

Rules:

* newest logs can appear at bottom,
* each line begins with timestamp or module,
* use muted color for metadata,
* error lines may use red,
* success lines may use green.

---

### 8. CommandInput

Inputs should look like terminal prompts.

Example:

```txt
root@trace:~$ 0xabc123...
```

Rules:

* no rounded input,
* no placeholder fluff,
* use command-like labels,
* blinking cursor for active input.

---

### 9. EmptyState

Never use friendly empty illustrations.

Use technical empty states.

Examples:

```txt
[ NO_DATA_LOADED ]
AWAITING_INPUT_HASH...
BUFFER_EMPTY
RUN_SCAN_TO_POPULATE_TABLE
```

Optional decorative block:

```txt
00000000 00000000 00000000
NULL_POINTER::NO_TRACE_SELECTED
```

---

### 10. ErrorState

Errors should feel like system faults.

Example:

```txt
+----------------------------------+
| [ SYSTEM_FAULT ]                 |
+----------------------------------+
| CODE   : RPC_TIMEOUT             |
| MODULE : TRACE_LOADER            |
| ACTION : RETRY_OR_SWITCH_RPC     |
+----------------------------------+
```

Rules:

* clear cause,
* clear recovery action,
* no cute language,
* no vague “Oops”.

---

### 11. LoadingState

No modern spinners.

Use:

```txt
[ / ] INDEXING_BLOCKS...
[ - ] DECODING_CALLDATA...
[ \ ] RECONSTRUCTING_TRACE...
[ | ] FINALIZING...
```

Or:

```txt
LOADING [010101010101------] 64%
```

---

## Motion & Animation Rules

### Allowed Motion

Use restrained mechanical motion:

* blinking block cursor,
* typewriter text,
* ASCII loading frames,
* scanline overlay,
* subtle glitch on title text,
* hard flicker on status changes,
* instant snapping hover states.

### Forbidden Motion

Avoid:

* spring animations,
* smooth bouncy transitions,
* soft fade-heavy motion,
* parallax,
* liquid motion,
* modern easing-heavy microinteractions.

### CSS Animation Ideas

Blinking cursor:

```css
@keyframes blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
```

CRT scanline:

```css
.scanline {
  background-image: repeating-linear-gradient(
    to bottom,
    rgba(255,255,255,0.04) 0px,
    rgba(255,255,255,0.04) 1px,
    transparent 1px,
    transparent 4px
  );
}
```

Subtle glitch:

```css
@keyframes glitch {
  0% { transform: translate(0, 0); }
  20% { transform: translate(-1px, 1px); }
  40% { transform: translate(1px, -1px); }
  60% { transform: translate(-1px, 0); }
  80% { transform: translate(1px, 1px); }
  100% { transform: translate(0, 0); }
}
```

Use glitch sparingly. Too much glitch makes the interface annoying and unreadable.

---

## Visual Texture System

Use CSS/SVG textures instead of image-heavy assets.

Recommended textures:

### 1. Scanlines

For CRT feeling.

### 2. Dot Matrix

For logos, avatars, and thumbnails.

### 3. Halftone

For hero graphics and large decorative shapes.

### 4. ASCII Noise

Use very low opacity text blocks.

Example:

```txt
0x41 0x52 0x50 0x43 0x5f 0x4c 0x4f 0x47
```

### 5. Barcode Blocks

Example:

```txt
|||| ||| ||||||| || ||||| ||||
```

### 6. Coordinate Grid

Example:

```txt
X:0192 Y:0048 Z:0007
```

---

## Image & Logo Treatment

When using logos, avatars, or illustrations:

* convert to monochrome,
* add scanline mask,
* use dithered pattern,
* use halftone dots,
* add hard border,
* avoid photorealistic clean images,
* avoid soft shadows,
* avoid glossy gradients.

Logo treatment examples:

```txt
[ ECS ]
ECS::CHAIN_FORENSICS
ECS_MONITOR_v0.1
```

For images:

* use `grayscale`,
* increase contrast,
* add `mix-blend-screen` carefully,
* overlay scanline pseudo-element,
* crop inside a terminal frame.

---

## Copywriting Style

The text should sound like a system, not a marketing website.

Use:

```txt
INITIALIZING...
ACCESS_GRANTED
TRACE_LOADED
CALLDATA_DECODED
RISK_VECTOR_FOUND
NO_PAYLOAD_DETECTED
EXECUTION_REVERTED
AWAITING_OPERATOR_INPUT
```

Avoid:

```txt
Welcome back!
Let's get started.
Oops, something went wrong.
Beautiful analytics for modern teams.
Your productivity companion.
```

For Web3 / security dashboards, prefer:

```txt
TX_HASH
CALL_STACK
REVERT_REASON
SELECTOR
GAS_USED
BLOCK_HEIGHT
RPC_LATENCY
POOL_STATE
HOOK_DATA
INVARIANT_CHECK
ATTACK_VECTOR
LOSS_ESTIMATE
```

---

## Accessibility Rules

Even though the design is brutalist, it must remain usable.

Requirements:

* Maintain strong contrast.
* Do not rely only on color for status.
* Use labels with status text.
* Keep body text readable.
* Do not overuse glitch animation.
* Respect `prefers-reduced-motion`.
* Ensure keyboard focus is visible.
* Buttons must have clear accessible labels.
* Tables must have readable headers.
* Do not make decorative ASCII interfere with screen readers.

Use `aria-hidden="true"` for purely decorative elements.

Example:

```tsx
<div aria-hidden="true" className="text-zinc-700">
  01010101 01001000 01000011
</div>
```

---

## Responsive Rules

The hacker aesthetic must work on mobile too.

Desktop:

* dense dashboard,
* multi-column grid,
* persistent sidebar,
* bottom status bar.

Tablet:

* collapse secondary panels,
* keep primary terminal window,
* use horizontal tabs.

Mobile:

* single-column terminal stack,
* sidebar becomes command menu,
* tables become scrollable,
* hashes are truncated,
* status bar becomes compact,
* reduce decorative noise.

Never let ASCII decoration destroy readability on small screens.

---

## Interaction Rules

### Hover

Use instant state changes.

Allowed:

```txt
invert colors
hard underline
border changes
prefix change: > RUN_SCAN → # RUN_SCAN
```

Avoid:

```txt
transition-all
soft color fades
scale animations
shadow growth
rounded hover cards
```

### Focus

Keyboard focus should be obvious:

```txt
outline outline-2 outline-offset-2
```

### Selection

Selected items should use hard inversion:

```txt
background: text color
text: background color
```

### Copy Actions

For hashes, addresses, selectors, and IDs:

* include copy action,
* show copied state as `[ COPIED ]`,
* reset after short delay.

---

## Web3 / Security Dashboard Specialization

This skill is especially suitable for:

* transaction explorer UI,
* trace viewer,
* smart contract audit dashboard,
* exploit simulator,
* MEV monitor,
* Uniswap / Curve / DEX quoting debugger,
* hook inspection dashboard,
* block scanner,
* mempool viewer,
* wallet risk scanner,
* forensic replay UI.

Recommended panels:

```txt
[ TX_OVERVIEW ]
[ CALL_TRACE ]
[ TOKEN_FLOW ]
[ BALANCE_DIFF ]
[ STORAGE_DIFF ]
[ REVERT_REASON ]
[ RISK_FLAGS ]
[ RAW_CALLDATA ]
[ DECODED_PARAMS ]
[ EVENT_LOGS ]
[ POOL_STATE ]
```

Recommended data labels:

```txt
CHAIN_ID
BLOCK_NUMBER
TX_INDEX
FROM
TO
VALUE
GAS_LIMIT
GAS_USED
SELECTOR
METHOD
STATUS
REVERT_REASON
CALL_DEPTH
TOKEN_IN
TOKEN_OUT
AMOUNT_IN
AMOUNT_OUT
POOL
HOOK
FEE
SLIPPAGE
```

---

## UI Anti-Patterns

Do not use:

* rounded corners,
* blurred glass panels,
* gradient backgrounds,
* pastel colors,
* floating cards,
* soft drop shadows,
* large marketing whitespace,
* emoji-heavy UI,
* friendly cartoon empty states,
* smooth spring animation,
* colorful SaaS charts,
* overly decorative fake hacker text that hurts readability.

Avoid fake nonsense overload. Decorative data should support the atmosphere but not block comprehension.

---

## Code Quality Rules

Always write modular reusable components.

Recommended components:

```txt
TerminalWindow
AsciiDivider
BinaryDeco
StatusBadge
CommandButton
CommandInput
LogStream
DataTable
MetricCell
HashDisplay
ScanlineOverlay
GlitchText
SystemStatusBar
PanelLabel
```

Rules:

* Keep decoration reusable.
* Keep layout components separate from data components.
* Avoid hardcoding large repeated ASCII blocks.
* Use props for labels, status, and content.
* Use semantic HTML where possible.
* Use accessible attributes for interactive controls.
* Use `aria-hidden` for visual-only decoration.

---

## Tailwind Implementation Rules

Default class style:

```txt
font-mono
rounded-none
border
border-zinc-300
bg-[#0C100C]
text-[#E5E5E5]
tracking-tight
uppercase for labels
```

Avoid:

```txt
rounded-xl
shadow-lg
backdrop-blur
bg-gradient-to-r
transition-all
duration-300
ease-out
```

Preferred button style:

```tsx
className="
  rounded-none border border-zinc-300 px-3 py-2
  font-mono text-xs uppercase
  text-zinc-100
  hover:bg-zinc-100 hover:text-zinc-950
  focus:outline-none focus:ring-2 focus:ring-zinc-100
"
```

---

## Example Visual Direction

For a hero section:

```txt
+------------------------------------------------------------+
| [ ECS::EXPLOIT_FORENSICS ]                           [-][x] |
+------------------------------------------------------------+
|                                                            |
|   ███████╗ ██████╗███████╗                                |
|   ██╔════╝██╔════╝██╔════╝                                |
|   █████╗  ██║     ███████╗                                |
|   ██╔══╝  ██║     ╚════██║                                |
|   ███████╗╚██████╗███████║                                |
|   ╚══════╝ ╚═════╝╚══════╝                                |
|                                                            |
|   ANALYZE_ONCHAIN_ATTACKS / DECODE_EXPLOITS / TRACE_FUNDS  |
|                                                            |
|   > START_TRACE                                            |
|   > OPEN_CASE_FILES                                        |
|                                                            |
+------------------------------------------------------------+
| 01001010 0xEVM 0xCALLDATA 0xREVERT 0xTRACE 01010101        |
+------------------------------------------------------------+
```

---

## Example Prompt Behavior

When user asks:

> Design a hacker dashboard for on-chain attack analysis.

You should produce:

* page structure,
* component architecture,
* visual system,
* React / Tailwind components,
* terminal-style copy,
* responsive behavior,
* loading/error/empty states,
* and optional animation details.

When user asks:

> Build me a component.

You should provide:

* reusable React component,
* Tailwind classes,
* no soft UI,
* no rounded corners,
* ASCII / binary decorations as reusable child components.

---

## Acceptance Checklist

Before finalizing any hacker/brutalist design, verify:

* [ ] All typography is monospace.
* [ ] Corners are sharp.
* [ ] Contrast is strong and readable.
* [ ] No glassmorphism.
* [ ] No gradients unless explicitly requested.
* [ ] No soft shadows.
* [ ] Main areas are segmented with borders.
* [ ] Empty space is filled intentionally.
* [ ] Decorative data is reusable, not hardcoded everywhere.
* [ ] Loading states use ASCII or terminal indicators.
* [ ] Error states are clear and actionable.
* [ ] Hover states snap instantly.
* [ ] Keyboard focus is visible.
* [ ] Reduced-motion users are respected.
* [ ] Mobile layout remains readable.
* [ ] The interface feels like a tool, not a landing page template.

---

## Final Style Summary

The final UI should feel like:

```txt
BRUTAL
MONOSPACE
HIGH-CONTRAST
BORDERED
DENSE
SYSTEMATIC
TERMINAL-LIKE
CYBER-FORENSIC
RETRO-FUTURISTIC
```

It should look like a serious machine interface built for operators, analysts, hackers, auditors, and engineers.
