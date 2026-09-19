import { getSlug, logHistory } from '../db.js';

export default async function checkRoutes(fastify) {
  fastify.get('/slug/check/:slug', async (request, reply) => {
    const project = request.project;
    const slug = request.params.slug;
    const startTime = Date.now();

    const existing = getSlug(project.id, slug);
    const available = !existing;

    logHistory(project.id, {
      operation: 'check',
      output_slug: slug,
      duration_ms: Date.now() - startTime,
      status: 'success',
      client_ip: request.ip,
    });

    return reply.send({
      success: true,
      slug,
      available,
      existing: existing
        ? {
            is_canonical: !!existing.is_canonical,
            canonical_slug: existing.canonical_slug,
            target_type: existing.target_type,
            target_id: existing.target_id,
            reserved: !!existing.reserved,
            reserved_until: existing.reserved_until,
            created_at: existing.created_at,
          }
        : null,
    });
  });
}
