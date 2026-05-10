// ============================================================
// db/mongo.ts — Mongoose connection
// ============================================================

import mongoose from 'mongoose';
import { config } from '../config';

let isConnected = false;

export async function connectMongo(): Promise<void> {
  if (isConnected) return;

  await mongoose.connect(config.mongo.uri, {
    serverSelectionTimeoutMS: 5000,
  });

  isConnected = true;
  console.log('[mongo] connected to', config.mongo.uri);

  mongoose.connection.on('error', (err) => {
    console.error('[mongo] connection error:', err);
    isConnected = false;
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[mongo] disconnected');
    isConnected = false;
  });
}

export function getMongoStatus(): boolean {
  return mongoose.connection.readyState === 1;
}
