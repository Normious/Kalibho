import { slugify } from './slugify.js';
import { claimSlugAtomic } from '../db.js';
import { config } from '../config.js';

export function generateUniqueSlug(project, title, options = {}) {
  const maxLength = options.maxLength || project.max_slug_length || config.defaults.maxSlugLength;
  const strategy = options.strategy || project.collision_strategy || config.defaults.collisionStrategy;

  const baseSlug = slugify(title, { maxLength });

  const result = claimSlugAtomic(project.id, baseSlug, {
    maxLength,
    strategy,
    maxAttempts: config.defaults.collisionMaxAttempts,
    targetType: options.targetType,
    targetId: options.targetId,
    metadata: options.metadata,
  });

  return {
    slug: result.slug,
    base_slug: baseSlug,
    collision: result.collision,
    attempts: result.attempts,
    id: result.id,
  };
}

export function generateBatch(project, items, options = {}) {
  const results = [];
  for (const item of items) {
    try {
      const title = typeof item === 'string' ? item : item.title;
      const perItemOpts = typeof item === 'object' ? { ...options, ...item } : options;
      const result = generateUniqueSlug(project, title, perItemOpts);
      results.push({
        success: true,
        title,
        slug: result.slug,
        base_slug: result.base_slug,
        collision: result.collision,
        attempts: result.attempts,
      });
    } catch (error) {
      results.push({
        success: false,
        title: typeof item === 'string' ? item : item.title,
        error: error.message,
      });
    }
  }
  return results;
}
