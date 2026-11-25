import assert from 'node:assert/strict';
import test from 'node:test';

import { buildQuery } from '../../src/query/build.js';

test('valid order values are accepted', () => {
  for (const order of ['publishedAt', '-publishedAt', 'createdAt', '-title']) {
    const { sql } = buildQuery({}, { order, limit: 10 });
    assert.match(sql, /ORDER BY \w+ (ASC|DESC), uri (ASC|DESC)/);
  }
});

test('order injection attempts throw YAMB_QUERY_VALIDATION', () => {
  for (const order of ['publishedAt; DROP TABLE posts --', 'rowid', '  publishedAt  ']) {
    assert.throws(() => buildQuery({}, { order, limit: 10 }), {
      code: 'YAMB_QUERY_VALIDATION'
    });
  }
});

test('error details include allowed values for actionable feedback', () => {
  assert.throws(
    () => buildQuery({}, { order: 'malicious', limit: 10 }),
    (err) =>
      err.code === 'YAMB_QUERY_VALIDATION' &&
      err.details.field === 'options' &&
      err.details.issues[0].values.includes('-publishedAt')
  );
});

test('pagination and values are bound, never interpolated', () => {
  const { sql, bindings } = buildQuery(
    { status: 'published', options: { kind: "'; DROP TABLE posts --" } },
    { limit: 5, offset: 2 }
  );

  assert.doesNotMatch(sql, /DROP|'published'|\b5\b|\b2\b/);
  assert.deepEqual(bindings.slice(-3), ['published', 5, 2]);
});
