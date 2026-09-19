import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '4010'),
  nodeEnv: process.env.NODE_ENV || 'development',
  databasePath: process.env.DATABASE_PATH || './data/kalibho.db',
  logLevel: process.env.LOG_LEVEL || 'info',

  defaults: {
    maxSlugLength: parseInt(process.env.DEFAULT_MAX_SLUG_LENGTH || '80'),
    collisionStrategy: process.env.DEFAULT_COLLISION_STRATEGY || 'suffix',
    collisionMaxAttempts: parseInt(process.env.DEFAULT_COLLISION_MAX_ATTEMPTS || '100'),
  },

  reservation: {
    defaultTtlSeconds: parseInt(process.env.DEFAULT_RESERVATION_TTL_SECONDS || '600'),
    maxTtlSeconds: parseInt(process.env.MAX_RESERVATION_TTL_SECONDS || '86400'),
  },

  limits: {
    minTitleLength: parseInt(process.env.MIN_TITLE_LENGTH || '1'),
    maxTitleLength: parseInt(process.env.MAX_TITLE_LENGTH || '500'),
    maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE || '100'),
  },

  cleanup: {
    purgeIntervalMs: parseInt(process.env.PURGE_EXPIRED_RESERVATIONS_INTERVAL_MS || '60000'),
  },
};
