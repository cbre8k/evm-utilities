"use strict";
// ============================================================
// shared/utils/opcodes.ts — EVM opcode reference (data only, no UI)
// Single source of truth for opcode info, lookups, and categories.
// UI-specific styling lives in src/utils/opcodes.ts
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPCODE_BY_HEX = exports.OPCODE_BY_NAME = exports.OPCODES = void 0;
exports.getOpcodeInfo = getOpcodeInfo;
// ── Full opcode table ─────────────────────────────────────────
exports.OPCODES = [
    // Stop & Arithmetic
    { hex: '00', name: 'STOP', gas: 0, category: 'stop', desc: 'Halt execution' },
    { hex: '01', name: 'ADD', gas: 3, category: 'arithmetic', desc: 'a + b mod 2²⁵⁶' },
    { hex: '02', name: 'MUL', gas: 5, category: 'arithmetic', desc: 'a * b mod 2²⁵⁶' },
    { hex: '03', name: 'SUB', gas: 3, category: 'arithmetic', desc: 'a - b mod 2²⁵⁶' },
    { hex: '04', name: 'DIV', gas: 5, category: 'arithmetic', desc: 'uint256 division' },
    { hex: '05', name: 'SDIV', gas: 5, category: 'arithmetic', desc: 'int256 division' },
    { hex: '06', name: 'MOD', gas: 5, category: 'arithmetic', desc: 'uint256 modulus' },
    { hex: '07', name: 'SMOD', gas: 5, category: 'arithmetic', desc: 'int256 modulus' },
    { hex: '08', name: 'ADDMOD', gas: 8, category: 'arithmetic', desc: '(a+b) % N' },
    { hex: '09', name: 'MULMOD', gas: 8, category: 'arithmetic', desc: '(a*b) % N' },
    { hex: '0a', name: 'EXP', gas: undefined, category: 'arithmetic', desc: 'a**b; 10+50*exp_bytes' },
    { hex: '0b', name: 'SIGNEXTEND', gas: 5, category: 'arithmetic', desc: 'sign extend x from b+1 bytes' },
    // Comparison
    { hex: '10', name: 'LT', gas: 3, category: 'comparison', desc: 'uint256 a < b' },
    { hex: '11', name: 'GT', gas: 3, category: 'comparison', desc: 'uint256 a > b' },
    { hex: '12', name: 'SLT', gas: 3, category: 'comparison', desc: 'int256 a < b' },
    { hex: '13', name: 'SGT', gas: 3, category: 'comparison', desc: 'int256 a > b' },
    { hex: '14', name: 'EQ', gas: 3, category: 'comparison', desc: 'a == b' },
    { hex: '15', name: 'ISZERO', gas: 3, category: 'comparison', desc: 'a == 0' },
    // Bitwise
    { hex: '16', name: 'AND', gas: 3, category: 'bitwise', desc: 'bitwise AND' },
    { hex: '17', name: 'OR', gas: 3, category: 'bitwise', desc: 'bitwise OR' },
    { hex: '18', name: 'XOR', gas: 3, category: 'bitwise', desc: 'bitwise XOR' },
    { hex: '19', name: 'NOT', gas: 3, category: 'bitwise', desc: 'bitwise NOT' },
    { hex: '1a', name: 'BYTE', gas: 3, category: 'bitwise', desc: 'i-th byte of x from left' },
    { hex: '1b', name: 'SHL', gas: 3, category: 'bitwise', desc: 'shift left' },
    { hex: '1c', name: 'SHR', gas: 3, category: 'bitwise', desc: 'logical shift right' },
    { hex: '1d', name: 'SAR', gas: 3, category: 'bitwise', desc: 'arithmetic shift right' },
    // SHA3
    { hex: '20', name: 'SHA3', gas: undefined, category: 'sha3', desc: 'keccak256(mem[ost:len]); 30+6*word' },
    // Environment
    { hex: '30', name: 'ADDRESS', gas: 2, category: 'env', desc: 'address(this)' },
    { hex: '31', name: 'BALANCE', gas: undefined, category: 'env', desc: 'addr.balance; 100 warm/2600 cold' },
    { hex: '32', name: 'ORIGIN', gas: 2, category: 'env', desc: 'tx.origin' },
    { hex: '33', name: 'CALLER', gas: 2, category: 'env', desc: 'msg.sender' },
    { hex: '34', name: 'CALLVALUE', gas: 2, category: 'env', desc: 'msg.value in wei' },
    { hex: '35', name: 'CALLDATALOAD', gas: 3, category: 'env', desc: 'msg.data[idx:idx+32]' },
    { hex: '36', name: 'CALLDATASIZE', gas: 2, category: 'env', desc: 'len(msg.data)' },
    { hex: '37', name: 'CALLDATACOPY', gas: undefined, category: 'env', desc: 'copy msg.data to memory; 3+3*word' },
    { hex: '38', name: 'CODESIZE', gas: 2, category: 'env', desc: 'len(this.code)' },
    { hex: '39', name: 'CODECOPY', gas: undefined, category: 'env', desc: 'copy this.code to memory; 3+3*word' },
    { hex: '3a', name: 'GASPRICE', gas: 2, category: 'env', desc: 'tx.gasprice in wei/gas' },
    { hex: '3b', name: 'EXTCODESIZE', gas: undefined, category: 'env', desc: 'len(addr.code); 100/2600' },
    { hex: '3c', name: 'EXTCODECOPY', gas: undefined, category: 'env', desc: 'copy addr.code to memory' },
    { hex: '3d', name: 'RETURNDATASIZE', gas: 2, category: 'env', desc: 'size of last return data' },
    { hex: '3e', name: 'RETURNDATACOPY', gas: undefined, category: 'env', desc: 'copy last return data to memory' },
    { hex: '3f', name: 'EXTCODEHASH', gas: undefined, category: 'env', desc: 'keccak256(addr.code); 100/2600' },
    // Block
    { hex: '40', name: 'BLOCKHASH', gas: 20, category: 'block', desc: 'hash of block N' },
    { hex: '41', name: 'COINBASE', gas: 2, category: 'block', desc: 'block.coinbase' },
    { hex: '42', name: 'TIMESTAMP', gas: 2, category: 'block', desc: 'block.timestamp' },
    { hex: '43', name: 'NUMBER', gas: 2, category: 'block', desc: 'block.number' },
    { hex: '44', name: 'DIFFICULTY', gas: 2, category: 'block', desc: 'block.difficulty' },
    { hex: '45', name: 'GASLIMIT', gas: 2, category: 'block', desc: 'block.gaslimit' },
    { hex: '46', name: 'CHAINID', gas: 2, category: 'block', desc: 'chain_id' },
    { hex: '47', name: 'SELFBALANCE', gas: 5, category: 'block', desc: 'address(this).balance' },
    { hex: '48', name: 'BASEFEE', gas: 2, category: 'block', desc: 'block.basefee' },
    // Stack / Memory
    { hex: '50', name: 'POP', gas: 2, category: 'stack', desc: 'discard top of stack' },
    { hex: '51', name: 'MLOAD', gas: 3, category: 'memory', desc: 'read word from memory' },
    { hex: '52', name: 'MSTORE', gas: 3, category: 'memory', desc: 'write word to memory' },
    { hex: '53', name: 'MSTORE8', gas: 3, category: 'memory', desc: 'write byte to memory' },
    { hex: '54', name: 'SLOAD', gas: undefined, category: 'storage', desc: 'storage[key]; 100 warm/2100 cold' },
    { hex: '55', name: 'SSTORE', gas: undefined, category: 'storage', desc: 'storage[key]=val; 100/2900/20000' },
    { hex: '56', name: 'JUMP', gas: 8, category: 'flow', desc: 'unconditional jump' },
    { hex: '57', name: 'JUMPI', gas: 10, category: 'flow', desc: 'conditional jump' },
    { hex: '58', name: 'PC', gas: 2, category: 'flow', desc: 'program counter' },
    { hex: '59', name: 'MSIZE', gas: 2, category: 'memory', desc: 'size of memory' },
    { hex: '5a', name: 'GAS', gas: 2, category: 'env', desc: 'gas remaining' },
    { hex: '5b', name: 'JUMPDEST', gas: 1, category: 'flow', desc: 'valid jump destination' },
    // PUSH1..PUSH32
    ...Array.from({ length: 32 }, (_, i) => ({
        hex: (0x60 + i).toString(16).padStart(2, '0'),
        name: `PUSH${i + 1}`,
        gas: 3,
        category: 'stack',
        desc: `push ${i + 1}-byte value`,
    })),
    // DUP1..DUP16
    ...Array.from({ length: 16 }, (_, i) => ({
        hex: (0x80 + i).toString(16).padStart(2, '0'),
        name: `DUP${i + 1}`,
        gas: 3,
        category: 'stack',
        desc: `clone ${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'} stack value`,
    })),
    // SWAP1..SWAP16
    ...Array.from({ length: 16 }, (_, i) => ({
        hex: (0x90 + i).toString(16).padStart(2, '0'),
        name: `SWAP${i + 1}`,
        gas: 3,
        category: 'stack',
        desc: `swap top with ${i + 2}${['st', 'nd', 'rd'][i + 1] ?? 'th'} value`,
    })),
    // LOG0..LOG4
    { hex: 'a0', name: 'LOG0', gas: undefined, category: 'log', desc: 'emit log, 0 topics; 375+8*bytes' },
    { hex: 'a1', name: 'LOG1', gas: undefined, category: 'log', desc: 'emit log, 1 topic' },
    { hex: 'a2', name: 'LOG2', gas: undefined, category: 'log', desc: 'emit log, 2 topics' },
    { hex: 'a3', name: 'LOG3', gas: undefined, category: 'log', desc: 'emit log, 3 topics' },
    { hex: 'a4', name: 'LOG4', gas: undefined, category: 'log', desc: 'emit log, 4 topics' },
    // Create & Call
    { hex: 'f0', name: 'CREATE', gas: undefined, category: 'create', desc: 'deploy contract; 32000+mem' },
    { hex: 'f1', name: 'CALL', gas: undefined, category: 'call', desc: 'external call with ETH' },
    { hex: 'f2', name: 'CALLCODE', gas: undefined, category: 'call', desc: 'like DELEGATECALL, no sender propagation' },
    { hex: 'f3', name: 'RETURN', gas: 0, category: 'stop', desc: 'return mem[ost:ost+len]' },
    { hex: 'f4', name: 'DELEGATECALL', gas: undefined, category: 'call', desc: 'call preserving msg.sender+msg.value' },
    { hex: 'f5', name: 'CREATE2', gas: undefined, category: 'create', desc: 'deploy with salt (EIP-1014)' },
    { hex: 'fa', name: 'STATICCALL', gas: undefined, category: 'call', desc: 'read-only call (EIP-214)' },
    { hex: 'fd', name: 'REVERT', gas: 0, category: 'stop', desc: 'revert state changes' },
    { hex: 'fe', name: 'INVALID', gas: undefined, category: 'stop', desc: 'invalid opcode (EIP-141)' },
    { hex: 'ff', name: 'SELFDESTRUCT', gas: undefined, category: 'stop', desc: 'send balance, mark for deletion' },
];
// ── Lookup maps ───────────────────────────────────────────────
exports.OPCODE_BY_NAME = new Map(exports.OPCODES.map(o => [o.name, o]));
exports.OPCODE_BY_HEX = new Map(exports.OPCODES.map(o => [o.hex, o]));
function getOpcodeInfo(nameOrHex) {
    return exports.OPCODE_BY_NAME.get(nameOrHex.toUpperCase()) ?? exports.OPCODE_BY_HEX.get(nameOrHex.toLowerCase());
}
//# sourceMappingURL=opcodes.js.map