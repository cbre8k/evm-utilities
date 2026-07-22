// ============================================================
// shared/utils/logger.ts — Scoped, level-filtered logging
// ============================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function readEnv(name: string): string | undefined {
  // Guarded so the logger is safe in browser bundles, where `process` may be
  // absent and only inlined variables exist.
  if (typeof process === 'undefined' || !process.env) return undefined;
  return process.env[name];
}

function resolveThreshold(): number {
  const configured = readEnv('LOG_LEVEL')?.toLowerCase() as LogLevel | undefined;
  if (configured && configured in SEVERITY) return SEVERITY[configured];
  return readEnv('NODE_ENV') === 'production' ? SEVERITY.info : SEVERITY.debug;
}

const threshold = resolveThreshold();

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Build a logger that prefixes every line with `[scope]`.
 *
 * Levels below LOG_LEVEL are dropped (default: `debug` in development,
 * `info` in production), so verbose per-transaction tracing can stay in the
 * code without flooding production logs.
 */
export function createLogger(scope: string): Logger {
  const emit = (
    level: Exclude<LogLevel, 'silent'>,
    consoleMethod: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    args: unknown[],
  ): void => {
    if (SEVERITY[level] < threshold) return;
    console[consoleMethod](`[${scope}] ${message}`, ...args);
  };

  return {
    debug: (message, ...args) => emit('debug', 'debug', message, args),
    info: (message, ...args) => emit('info', 'info', message, args),
    warn: (message, ...args) => emit('warn', 'warn', message, args),
    error: (message, ...args) => emit('error', 'error', message, args),
  };
}
