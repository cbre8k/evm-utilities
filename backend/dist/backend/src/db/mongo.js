"use strict";
// ============================================================
// db/mongo.ts — Mongoose connection
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectMongo = connectMongo;
exports.getMongoStatus = getMongoStatus;
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = require("../config");
let isConnected = false;
async function connectMongo() {
    if (isConnected)
        return;
    await mongoose_1.default.connect(config_1.config.mongo.uri, {
        serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log('[mongo] connected to', config_1.config.mongo.uri);
    mongoose_1.default.connection.on('error', (err) => {
        console.error('[mongo] connection error:', err);
        isConnected = false;
    });
    mongoose_1.default.connection.on('disconnected', () => {
        console.warn('[mongo] disconnected');
        isConnected = false;
    });
}
function getMongoStatus() {
    return mongoose_1.default.connection.readyState === 1;
}
//# sourceMappingURL=mongo.js.map