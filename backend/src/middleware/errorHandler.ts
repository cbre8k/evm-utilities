// ============================================================
// middleware/errorHandler.ts
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('error');

/** Errors carrying an explicit HTTP status are reported to the client as-is. */
interface HttpError {
  status?: number;
  message?: string;
}

/**
 * Terminal Express error handler. Responses always use the app-wide
 * `{ error: string }` shape. Only messages on errors that opted into a
 * 4xx status are surfaced — an unexpected 500 gets a generic message so
 * internal detail stays in the logs.
 */
export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status ?? 500;
  const message = err.message ?? 'Internal Server Error';
  log.error(`${status} ${message}`);
  res.status(status).json({
    error: status >= 500 ? 'Internal Server Error' : message,
  });
}
