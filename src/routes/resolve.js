import { getSlug as getSlugRow } from '../db.js';

export default async function resolveRoutes(fastify) {
  fastify.get('/slug/:slug', async (request, reply) => {
    const project = request.project;
    const slug = request.params.slug;

    const row = getSlugRow(project.id, slug);
    if (!row) {
      return reply.status(404).send({ success: false, error: 'Slug not found' });
    }

    if (!row.is_canonical) {
      const canonical = getSlugRow(project.id, row.canonical_slug);
      return reply.send({
        success: true,
        slug,
        is_canonical: false,
        redirect_to: row.canonical_slug,
        canonical: canonical
          ? {
              slug: canonical.slug,
              target_type: canonical.target_type,
              target_id: canonical.target_id,
              metadata: canonical.metadata ? JSON.parse(canonical.metadata) : null,
            }
          : null,
      });
    }

    return reply.send({
      success: true,
      slug,
      is_canonical: true,
      target_type: row.target_type,
      target_id: row.target_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  });
}
