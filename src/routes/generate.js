import { generateUniqueSlug, generateBatch } from '../slug/generator.js';
import { logHistory } from '../db.js';
import { config } from '../config.js';

const generateSchema = {
  body: {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 500 },
      target_type: { type: 'string' },
      target_id: { type: 'string' },
      max_length: { type: 'number', minimum: 8, maximum: 200 },
      strategy: { type: 'string', enum: ['suffix', 'timestamp', 'uuid'] },
      metadata: { type: 'object' },
    },
  },
};

const batchSchema = {
  body: {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                title: { type: 'string' },
                target_type: { type: 'string' },
                target_id: { type: 'string' },
                max_length: { type: 'number' },
                strategy: { type: 'string' },
                metadata: { type: 'object' },
              },
            },
          ],
        },
      },
      strategy: { type: 'string', enum: ['suffix', 'timestamp', 'uuid'] },
      max_length: { type: 'number' },
    },
  },
};

export default async function generateRoutes(fastify) {
  fastify.post('/slug/generate', { schema: generateSchema }, async (request, reply) => {
    const project = request.project;
    const body = request.body;
    const startTime = Date.now();

    const title = body.title.trim();
    if (title.length < config.limits.minTitleLength) {
      return reply.status(400).send({ error: 'Title too short' });
    }

    try {
      const result = generateUniqueSlug(project, title, {
        maxLength: body.max_length,
        strategy: body.strategy,
        targetType: body.target_type,
        targetId: body.target_id,
        metadata: body.metadata,
      });

      const duration = Date.now() - startTime;

      logHistory(project.id, {
        operation: 'generate',
        input_title: title,
        output_slug: result.slug,
        collision: result.collision,
        attempts: result.attempts,
        duration_ms: duration,
        status: 'success',
        client_ip: request.ip,
        user_agent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        title,
        slug: result.slug,
        base_slug: result.base_slug,
        collision: result.collision,
        attempts: result.attempts,
        duration_ms: duration,
      });
    } catch (error) {
      logHistory(project.id, {
        operation: 'generate',
        input_title: title,
        duration_ms: Date.now() - startTime,
        status: 'failed',
        error_message: error.message,
        client_ip: request.ip,
      });
      return reply.status(500).send({ error: 'Generation failed', details: error.message });
    }
  });

  fastify.post('/slug/generate/batch', { schema: batchSchema }, async (request, reply) => {
    const project = request.project;
    const body = request.body;

    if (body.items.length > config.limits.maxBatchSize) {
      return reply.status(400).send({
        error: `Batch size exceeds maximum of ${config.limits.maxBatchSize}`,
      });
    }

    const startTime = Date.now();
    const results = generateBatch(project, body.items, {
      maxLength: body.max_length,
      strategy: body.strategy,
    });

    logHistory(project.id, {
      operation: 'generate',
      input_title: `batch: ${body.items.length} items`,
      duration_ms: Date.now() - startTime,
      status: 'success',
      attempts: body.items.length,
      client_ip: request.ip,
      user_agent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      total: body.items.length,
      succeeded: results.filter((r) => r.success).length,
      duration_ms: Date.now() - startTime,
      results,
    });
  });
}
