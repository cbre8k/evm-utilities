export type PageState = 'idle' | 'loading' | 'done' | 'error';
export type ExplorerTab = 'summary' | 'events' | 'state' | 'flow' | 'gas';

export const CHAIN_NAMES: Record<number, string> = {
  1: 'Mainnet',
  10: 'Optimism',
  56: 'BNB Smart Chain',
  137: 'Polygon',
  42161: 'Arbitrum One',
  8453: 'Base',
  11155111: 'Sepolia',
};

export function quantity(value?: string | number | bigint | null): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (!value) return 0n;
  try { return BigInt(value); } catch { return 0n; }
}

export function formatUnits(value: bigint, decimals: number, precision: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  if (fraction === 0n) return whole.toString();
  const padded = fraction.toString().padStart(decimals, '0').slice(0, precision);
  const trimmed = padded.replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

export function formatEth(value?: string | number | bigint | null): string {
  return `${formatUnits(quantity(value), 18, 6)} ETH`;
}

export function formatGwei(value?: string | number | bigint | null): string {
  return `${formatUnits(quantity(value), 9, 3)} Gwei`;
}

export function formatTxType(value?: string): string {
  if (!value) return 'Unknown';
  const type = Number(quantity(value));
  if (type === 2) return '2 (EIP-1559)';
  if (type === 1) return '1 (EIP-2930)';
  if (type === 0) return '0 (Legacy)';
  return String(type);
}

export function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp * 1000);
  const pad = (value: number) => value.toString().padStart(2, '0');
  const exact = [
    pad(date.getDate()),
    pad(date.getMonth() + 1),
    date.getFullYear(),
  ].join('/') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ] as const;
  const [unit, seconds] = units.find(([, value]) => elapsed >= value) ?? ['second', 1];
  const count = Math.floor(elapsed / seconds);
  const label = `${count} ${unit}${count === 1 ? '' : 's'} ago`;
  return `${label} (${exact})`;
}

export function shortHex(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}
