import assert from 'node:assert/strict';
import test from 'node:test';

import { buildQuery } from '../../src/query/build.js';

test('valid order values are accepted', () => {
  for (const order of ['publishedAt', '-publishedAt', 'createdAt', '-title']) {
    const { sql } = buildQuery({}, { order, limit: 10 });
    assert.match(sql, /ORDER BY \w+ (ASC|DESC), uri (ASC|DESC)/);
  }
});

test('order injection attempt throws YAMB_QUERY_VALIDATION', () => {
  assert.throws(
    () => buildQuery({}, { order: 'publishedAt; DROP TABLE posts --', limit: 10 }),
    (err) => err.code === 'YAMB_QUERY_VALIDATION' && /invalid order/.test(err.message)
  );
});

test('unknown field in order throws YAMB_QUERY_VALIDATION', () => {
  assert.throws(
    () => buildQuery({}, { order: 'rowid', limit: 10 }),
    (err) => err.code === 'YAMB_QUERY_VALIDATION'
  );
});

test('order with stray whitespace is rejected', () => {
  assert.throws(
    () => buildQuery({}, { order: '  publishedAt  ', limit: 10 }),
    (err) => err.code === 'YAMB_QUERY_VALIDATION'
  );
});

test('error details include allowed values for actionable feedback', () => {
  try {
    buildQuery({}, { order: 'malicious', limit: 10 });
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'YAMB_QUERY_VALIDATION');
    assert.equal(err.details.field, 'order');
    assert.ok(Array.isArray(err.details.allowed));
    assert.ok(err.details.allowed.includes('-publishedAt'));
  }
});
