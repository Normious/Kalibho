import { renameSlug, logHistory } from '../db.js';
import { slugify } from '../slug/slugify.js';

const renameSchema = {
  body: {
    type: 'object',
    required: ['new_slug'],
    properties: {
      new_slug: { type: 'string', minLength: 1, maxLength: 200 },
      metadata: { type: 'object' },
    },
  },
};

export default async function renameRoutes(fastify) {
  fastify.put('/slug/:slug/rename', { schema: renameSchema }, async (request, reply) => {
    const project = request.project;
    const oldSlug = request.params.slug;
    const body = request.body;
    const startTime = Date.now();

    const newSlug = slugify(body.new_slug, { maxLength: project.max_slug_length });

    if (newSlug === oldSlug) {
      return reply.status(400).send({ error: 'New slug is the same as old slug' });
    }

    const result = renameSlug(project.id, oldSlug, newSlug, body.metadata);

    logHistory(project.id, {
      operation: 'rename',
      input_title: oldSlug,
      output_slug: newSlug,
      duration_ms: Date.now() - startTime,
      status: result.success ? 'success' : 'failed',
      error_message: result.success ? null : result.reason,
      client_ip: request.ip,
    });

    if (!result.success) {
      const statusMap = {
        slug_not_found: 404,
        not_canonical: 400,
        new_slug_taken: 409,
      };
      return reply.status(statusMap[result.reason] || 400).send({
        success: false,
        error: result.reason,
      });
    }

    return reply.send({
      success: true,
      old_slug: oldSlug,
      new_slug: newSlug,
      message: 'Slug renamed. Old slug now redirects to new.',
    });
  });
}
