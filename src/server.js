import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

import { config } from './config.js';
import { getDatabase, purgeExpiredReservations } from './db.js';
import { authenticate } from './middleware/auth.js';
import generateRoutes from './routes/generate.js';
import checkRoutes from './routes/check.js';
import reserveRoutes from './routes/reserve.js';
import renameRoutes from './routes/rename.js';
import resolveRoutes from './routes/resolve.js';
import historyRoutes from './routes/history.js';

export function buildApp() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  return fastify;
}

const fastify = buildApp();

await fastify.register(cors, { origin: true });
await fastify.register(helmet, { contentSecurityPolicy: false });

getDatabase();
fastify.log.info('Database initialized');

fastify.get('/health', async () => ({
  service: 'Kalibho — Slug Generator Service',
  version: '1.0.0',
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

fastify.get('/', async () => ({
  service: 'Kalibho',
  description: 'Slug/URL generator + collision checker',
  version: '1.0.0',
  endpoints: {
    'POST /slug/generate': 'Title → unique slug',
    'POST /slug/generate/batch': 'Batch generate up to 100 slugs',
    'GET /slug/check/:slug': 'Check if slug is available',
    'POST /slug/reserve': 'Temporarily reserve a slug',
    'DELETE /slug/reserve/:slug': 'Release a reservation',
    'PUT /slug/:slug/rename': 'Rename slug (keeps old as alias)',
    'GET /slug/:slug': 'Resolve slug → target',
    'GET /slug/history': 'Generation history',
    'GET /slug/stats': 'Usage analytics',
    'GET /slug/strategies': 'List collision strategies',
    'GET /health': 'Health check',
  },
}));

await fastify.register(async (instance) => {
  instance.addHook('preHandler', authenticate);
  instance.register(generateRoutes);
  instance.register(checkRoutes);
  instance.register(reserveRoutes);
  instance.register(renameRoutes);
  // resolve last: GET /slug/:slug would otherwise shadow /slug/check/*, /slug/history, /slug/stats, /slug/strategies
  instance.register(resolveRoutes);
  instance.register(historyRoutes);
});

const purgeTimer = setInterval(() => {
  try {
    const purged = purgeExpiredReservations();
    if (purged > 0) fastify.log.info(`Purged ${purged} expired reservations`);
  } catch (err) {
    fastify.log.error({ err }, 'Failed to purge reservations');
  }
}, config.cleanup.purgeIntervalMs);
purgeTimer.unref?.();

const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    fastify.log.info(`Kalibho running on port ${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

process.on('SIGINT', async () => { await fastify.close(); process.exit(0); });
process.on('SIGTERM', async () => { await fastify.close(); process.exit(0); });

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  start();
}

export default fastify;
