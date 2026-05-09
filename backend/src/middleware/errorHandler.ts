// ============================================================
// middleware/errorHandler.ts
// ============================================================

import type { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status ?? 500;
  const message = err.message ?? 'Internal Server Error';
  console.error('[error]', status, message);
  res.status(status).json({ error: message });
}
