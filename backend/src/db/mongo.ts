// ============================================================
// db/mongo.ts — Mongoose connection
// ============================================================

import mongoose from 'mongoose';
import { config } from '../config';
import { createLogger } from '@shared/utils/logger';

const log = createLogger('mongo');

let isConnected = false;

export async function connectMongo(): Promise<void> {
  if (isConnected) return;

  await mongoose.connect(config.mongo.uri, {
    serverSelectionTimeoutMS: 5000,
  });

  isConnected = true;
  log.info('connected to', config.mongo.uri);

  mongoose.connection.on('error', (err) => {
    log.error('connection error:', err);
    isConnected = false;
  });

  mongoose.connection.on('disconnected', () => {
    log.warn('disconnected');
    isConnected = false;
  });
}

export function getMongoStatus(): boolean {
  return mongoose.connection.readyState === 1;
}
