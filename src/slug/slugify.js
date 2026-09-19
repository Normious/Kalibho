export function slugify(title, options = {}) {
  const maxLength = options.maxLength || 80;
  const separator = options.separator || '-';
  const lowercase = options.lowercase !== false;
  const stripDiacritics = options.stripDiacritics !== false;
  const preserveCase = options.preserveCase || false;

  if (typeof title !== 'string') {
    throw new Error('Title must be a string');
  }

  let slug = title;
  slug = slug.trim().replace(/\s+/g, ' ');

  if (stripDiacritics) {
    slug = slug.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  }

  if (lowercase && !preserveCase) {
    slug = slug.toLowerCase();
  }

  slug = slug.replace(/[^\p{L}\p{N}]+/gu, separator);

  const sepRegex = new RegExp(`\\${separator}+`, 'g');
  slug = slug.replace(sepRegex, separator);

  const trimRegex = new RegExp(`^\\${separator}+|\\${separator}+$`, 'g');
  slug = slug.replace(trimRegex, '');

  if (slug.length > maxLength) {
    slug = slug.slice(0, maxLength);
    const lastSep = slug.lastIndexOf(separator);
    if (lastSep > maxLength * 0.6) {
      slug = slug.slice(0, lastSep);
    }
    slug = slug.replace(trimRegex, '');
  }

  if (!slug) {
    slug = `item-${Date.now().toString(36)}`;
  }

  return slug;
}

export function validateSlug(slug, options = {}) {
  const maxLength = options.maxLength || 80;
  const minLength = options.minLength || 1;

  if (typeof slug !== 'string') return { valid: false, reason: 'not_a_string' };
  if (slug.length < minLength) return { valid: false, reason: 'too_short' };
  if (slug.length > maxLength) return { valid: false, reason: 'too_long' };
  if (!/^[a-z0-9-]+$/.test(slug) && !/^[\p{L}\p{N}-]+$/u.test(slug)) {
    return { valid: false, reason: 'invalid_characters' };
  }
  if (slug.startsWith('-') || slug.endsWith('-')) {
    return { valid: false, reason: 'leading_or_trailing_dash' };
  }
  if (slug.includes('--')) return { valid: false, reason: 'consecutive_dashes' };

  return { valid: true };
}
