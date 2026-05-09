"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPcToInstMapping = buildPcToInstMapping;
exports.parseSourceMap = parseSourceMap;
exports.getLineForOffset = getLineForOffset;
function buildPcToInstMapping(bytecode) {
    const pcToInst = {};
    const bin = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
    let pc = 0;
    let inst = 0;
    for (let i = 0; i < bin.length; i += 2) {
        const byte = parseInt(bin.slice(i, i + 2), 16);
        pcToInst[pc] = inst;
        if (byte >= 0x60 && byte <= 0x7f) {
            const skip = byte - 0x5f;
            i += skip * 2;
            pc += skip + 1;
        }
        else {
            pc += 1;
        }
        inst += 1;
    }
    return pcToInst;
}
function parseSourceMap(sourceMap) {
    const parts = sourceMap.split(';');
    const locations = [];
    let last = { start: -1, length: -1, fileIndex: -1, jump: '-', modifier: -1 };
    for (const part of parts) {
        const fields = part.split(':');
        const loc = { ...last };
        if (fields[0])
            loc.start = parseInt(fields[0], 10);
        if (fields[1])
            loc.length = parseInt(fields[1], 10);
        if (fields[2])
            loc.fileIndex = parseInt(fields[2], 10);
        if (fields[3])
            loc.jump = fields[3];
        if (fields[4])
            loc.modifier = parseInt(fields[4], 10);
        locations.push(loc);
        last = loc;
    }
    return locations;
}
function getLineForOffset(source, offset) {
    if (offset < 0)
        return 0;
    return source.slice(0, offset).split('\n').length;
}
//# sourceMappingURL=sourceMap.js.map