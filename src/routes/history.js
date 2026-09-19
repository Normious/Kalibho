import { listHistory, getStats } from '../db.js';
import { listStrategies } from '../slug/strategies.js';

export default async function historyRoutes(fastify) {
  fastify.get('/slug/history', async (request) => {
    const project = request.project;
    const q = request.query;

    const limit = Math.min(parseInt(q.limit || '20'), 100);
    const offset = parseInt(q.offset || '0');

    const { entries, total } = listHistory(project.id, {
      operation: q.operation,
      status: q.status,
      search: q.search,
      from_date: q.from_date ? parseInt(q.from_date) : undefined,
      to_date: q.to_date ? parseInt(q.to_date) : undefined,
      limit,
      offset,
    });

    return {
      success: true,
      entries,
      pagination: { total, limit, offset, has_more: offset + entries.length < total },
    };
  });

  fastify.get('/slug/stats', async (request) => {
    const project = request.project;
    const days = Math.min(parseInt(request.query.days || '30'), 365);
    const stats = getStats(project.id, days);
    return { success: true, ...stats };
  });

  fastify.get('/slug/strategies', async () => ({
    success: true,
    strategies: listStrategies(),
  }));
}
