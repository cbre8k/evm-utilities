"use strict";
// ============================================================
// middleware/errorHandler.ts
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, _req, res, _next) {
    const status = err.status ?? 500;
    const message = err.message ?? 'Internal Server Error';
    console.error('[error]', status, message);
    res.status(status).json({ error: message });
}
//# sourceMappingURL=errorHandler.js.map