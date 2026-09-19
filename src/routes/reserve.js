import { reserveSlug, releaseSlug, logHistory } from '../db.js';
import { config } from '../config.js';

const reserveSchema = {
  body: {
    type: 'object',
    required: ['slug'],
    properties: {
      slug: { type: 'string', minLength: 1, maxLength: 200 },
      ttl_seconds: { type: 'number', minimum: 60, maximum: 86400 },
      metadata: { type: 'object' },
    },
  },
};

export default async function reserveRoutes(fastify) {
  fastify.post('/slug/reserve', { schema: reserveSchema }, async (request, reply) => {
    const project = request.project;
    const body = request.body;
    const startTime = Date.now();

    const ttl = Math.min(
      body.ttl_seconds || config.reservation.defaultTtlSeconds,
      config.reservation.maxTtlSeconds
    );

    const result = reserveSlug(project.id, body.slug, ttl, body.metadata);

    logHistory(project.id, {
      operation: 'reserve',
      output_slug: body.slug,
      duration_ms: Date.now() - startTime,
      status: result.success ? 'success' : 'failed',
      error_message: result.success ? null : result.reason,
      client_ip: request.ip,
    });

    if (!result.success) {
      return reply.status(409).send({
        success: false,
        slug: body.slug,
        error: 'Slug is already taken',
        reason: result.reason,
      });
    }

    return reply.send({
      success: true,
      slug: body.slug,
      reserved_until: result.expires_at,
      ttl_seconds: ttl,
      reclaimed: result.reclaimed || false,
    });
  });

  // Primary: /slug/reserve/:slug (avoids clash with GET /slug/:slug)
  fastify.delete('/slug/reserve/:slug', async (request, reply) => {
    const project = request.project;
    const slug = request.params.slug;

    const released = releaseSlug(project.id, slug);
    if (!released) {
      return reply.status(404).send({ error: 'Reservation not found' });
    }

    return reply.send({ success: true, slug, message: 'Reservation released' });
  });

  // Compat alias for spec path DELETE /slug/:slug/reserve
  fastify.delete('/slug/:slug/reserve', async (request, reply) => {
    const project = request.project;
    const slug = request.params.slug;

    const released = releaseSlug(project.id, slug);
    if (!released) {
      return reply.status(404).send({ error: 'Reservation not found' });
    }

    return reply.send({ success: true, slug, message: 'Reservation released' });
  });
}
