import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, validateSlug } from '../src/slug/slugify.js';

describe('slugify', () => {
  it('basic: Hello World! → hello-world', () => {
    assert.equal(slugify('Hello World!'), 'hello-world');
  });
  it('unicode: Café Déjà Vu → cafe-deja-vu', () => {
    assert.equal(slugify('Café Déjà Vu'), 'cafe-deja-vu');
  });
  it('unicode N°1: Café Déjà Vu — N°1 Review → cafe-deja-vu-n-1-review', () => {
    assert.equal(slugify('Café Déjà Vu — N°1 Review'), 'cafe-deja-vu-n-1-review');
  });
  it('collapses dashes + trims', () => {
    assert.equal(slugify('  --Hello   ---   World-- '), 'hello-world');
  });
  it('empty → item- fallback', () => {
    assert.match(slugify('!!!'), /^item-/);
  });
  it('truncates at word boundary', () => {
    const long = 'wireless headphones pro max ultra premium edition with extra bass boost active noise cancelling bluetooth five';
    const s = slugify(long, { maxLength: 30 });
    assert.ok(s.length <= 30);
    assert.ok(!s.endsWith('-'));
  });
  it('throws on non-string', () => {
    assert.throws(() => slugify(123), /Title must be a string/);
  });
});

describe('validateSlug', () => {
  it('valid', () => assert.deepEqual(validateSlug('hello-world'), { valid: true }));
  it('leading dash', () => assert.equal(validateSlug('-hello').reason, 'leading_or_trailing_dash'));
  it('consecutive dashes', () => assert.equal(validateSlug('a--b').reason, 'consecutive_dashes'));
  it('too long', () => assert.equal(validateSlug('a'.repeat(81)).reason, 'too_long'));
});
