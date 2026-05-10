"use strict";
// ============================================================
// backend/src/utils/opcodes.ts — Re-export shared opcode data
// + backend-only INTERESTING_OPS filter set
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERESTING_OPS = exports.getOpcodeInfo = exports.OPCODE_BY_HEX = exports.OPCODE_BY_NAME = exports.OPCODES = void 0;
var opcodes_1 = require("@shared/utils/opcodes");
Object.defineProperty(exports, "OPCODES", { enumerable: true, get: function () { return opcodes_1.OPCODES; } });
Object.defineProperty(exports, "OPCODE_BY_NAME", { enumerable: true, get: function () { return opcodes_1.OPCODE_BY_NAME; } });
Object.defineProperty(exports, "OPCODE_BY_HEX", { enumerable: true, get: function () { return opcodes_1.OPCODE_BY_HEX; } });
Object.defineProperty(exports, "getOpcodeInfo", { enumerable: true, get: function () { return opcodes_1.getOpcodeInfo; } });
/**
 * Opcodes worth including in the filtered structlog sent to the frontend.
 * Intentionally conservative — preserves state changes, call boundaries,
 * emitted events, and high-signal execution markers without shipping
 * the control-flow / stack / memory noise that dominates large traces.
 */
exports.INTERESTING_OPS = new Set([
    // Storage
    'SLOAD', 'SSTORE',
    // Events
    'LOG0', 'LOG1', 'LOG2', 'LOG3', 'LOG4',
    // Internal control flow
    'JUMP', 'JUMPDEST',
    // Call variants
    'CALL', 'CALLCODE', 'STATICCALL', 'DELEGATECALL',
    // Deployment
    'CREATE', 'CREATE2',
    // Termination
    'REVERT', 'RETURN', 'STOP', 'INVALID', 'SELFDESTRUCT',
    // High-signal helpers
    'SHA3',
]);
//# sourceMappingURL=opcodes.js.map