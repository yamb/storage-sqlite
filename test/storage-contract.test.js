import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { yamb } from 'yamb';

import { getState } from '../src/storage/internal.js';
import { sqlite, test, path } from './prepared-sqlite.js';

const I = (s) => Temporal.Instant.from(s);

function makeBlog({ clock = '2026-04-26T12:00:00Z', file = path } = {}) {
  return yamb({
    storage: sqlite({ path: file }),
    base: 'https://example.com',
    timeZone: 'UTC',
    clock: () => I(clock)
  });
}

test('standalone all() rejects an object-valued predicate with YAMB_QUERY_VALIDATION', async () => {
  const storage = sqlite();
  await storage.open({ timeZone: 'UTC', clock: () => I('2026-04-01T00:00:00Z') });

  await assert.rejects(
    async () => {
      for await (const _ of storage.all({ status: { $ne: null } }, {})) {
      }
    },
    { code: 'YAMB_QUERY_VALIDATION' }
  );

  await storage.close();
});

test('update of a vanished row throws PostNotFoundError, no silent loss', async () => {
  const file = path;
  const blog = makeBlog({ file });
  await blog.open();
  try {
    const p = await blog.create({
      title: 'Durable',
      text: '.',
      status: 'published',
      publishedAt: I('2026-04-01T00:00:00Z')
    });

    const raw = new DatabaseSync(file);
    raw.prepare('DELETE FROM posts WHERE uri = ?').run(p.uri);
    raw.close();

    p.title = 'Durable v2';
    await assert.rejects(() => p.save(), { code: 'YAMB_POST_NOT_FOUND' });
  } finally {
    await blog[Symbol.asyncDispose]();
  }
});

test('a semantically-corrupt row reads as StorageReadError', async () => {
  const file = path;
  const blog = makeBlog({ file });
  await blog.open();
  try {
    const p = await blog.create({
      title: 'Corrupt',
      text: '.',
      status: 'published',
      publishedAt: I('2026-04-01T00:00:00Z')
    });

    const raw = new DatabaseSync(file);
    const row = raw.prepare('SELECT raw_json FROM posts WHERE uri = ?').get(p.uri);
    const obj = JSON.parse(row.raw_json);
    obj.createdAt = 'not-an-instant';
    raw.prepare('UPDATE posts SET raw_json = ? WHERE uri = ?').run(JSON.stringify(obj), p.uri);
    raw.close();

    await blog.sync();
    await assert.rejects(() => blog.fetch(p.uri), { code: 'YAMB_STORAGE_READ' });
  } finally {
    await blog[Symbol.asyncDispose]();
  }
});

test('next() includes a post published exactly at clock()', async () => {
  const blog = makeBlog({ clock: '2026-04-02T00:00:00Z' });
  await blog.open();
  try {
    const a = await blog.create({
      title: 'A',
      text: '.',
      status: 'published',
      publishedAt: I('2026-04-01T00:00:00Z')
    });
    await blog.create({
      title: 'B',
      text: '.',
      status: 'published',
      publishedAt: I('2026-04-02T00:00:00Z')
    });

    const nxt = await a.next();
    assert.equal(nxt?.title, 'B');
  } finally {
    await blog[Symbol.asyncDispose]();
  }
});

test('scheduled without publishedAt is rejected on save', async () => {
  const blog = makeBlog();
  await blog.open();
  try {
    await assert.rejects(() => blog.create({ title: 'Plan', text: '.', status: 'scheduled' }), {
      code: 'YAMB_POST_VALIDATION'
    });
  } finally {
    await blog[Symbol.asyncDispose]();
  }
});

test('save() persists the trimmed title, not the raw input', async () => {
  const blog = makeBlog();
  await blog.open();
  try {
    const p = await blog.create({
      title: '   Spaced Out   ',
      text: '.',
      status: 'published',
      publishedAt: I('2026-04-01T00:00:00Z')
    });
    const fetched = await blog.fetch(p.uri);
    assert.equal(fetched.title, 'Spaced Out');
  } finally {
    await blog[Symbol.asyncDispose]();
  }
});

test('next() works at the year-9999 clock boundary (no sentinel overflow)', async () => {
  const blog = yamb({
    storage: sqlite(),
    base: 'https://example.com',
    timeZone: 'UTC',
    clock: () => I('9999-12-31T23:59:59.999999999Z')
  });
  await blog.open();
  try {
    const a = await blog.create({
      title: 'A',
      text: '.',
      status: 'published',
      publishedAt: I('9999-12-31T23:59:59.999999997Z')
    });
    await blog.create({
      title: 'B',
      text: '.',
      status: 'published',
      publishedAt: I('9999-12-31T23:59:59.999999998Z')
    });
    const nxt = await a.next();
    assert.equal(nxt?.title, 'B', 'a.next() must reach B, not be dropped by an overflowing cap');
  } finally {
    await blog[Symbol.asyncDispose]();
  }
});

test('standalone all() rejects a malformed cursor shape', async () => {
  const storage = sqlite();
  await storage.open({ timeZone: 'UTC', clock: () => I('2026-04-01T00:00:00Z') });

  await assert.rejects(
    async () => {
      for await (const _ of storage.all({ cursor: ['bad'] }, { order: 'publishedAt', limit: 1 })) {
      }
    },
    { code: 'YAMB_QUERY_VALIDATION' }
  );

  await storage.close();
});

test('build() with a bad temporal value throws PostDateError, not StorageReadError', async () => {
  const blog = makeBlog();
  await blog.open();
  try {
    assert.throws(() => blog.build({ title: 'x', text: '.', createdAt: 'not an instant' }), {
      code: 'YAMB_POST_DATE_INVALID'
    });
  } finally {
    await blog[Symbol.asyncDispose]();
  }
});

test('two concurrent iterators over one all() result do not corrupt each other', async () => {
  const storage = sqlite();
  await storage.open({ timeZone: 'UTC', clock: () => I('2026-04-01T00:00:00Z') });

  const posts = [
    { slug: 'a', day: '01' },
    { slug: 'b', day: '02' },
    { slug: 'c', day: '03' }
  ];

  for (const { slug, day } of posts) {
    await storage.save({
      uri: `2026/04/${slug}`,
      slug,
      title: slug,
      status: 'published',
      text: '.',
      tags: [],
      links: { related: [] },
      createdAt: I('2026-04-01T00:00:00Z').toString(),
      updatedAt: I('2026-04-01T00:00:00Z').toString(),
      publishedAt: I(`2026-04-${day}T00:00:00Z`).toString()
    });
  }

  const result = storage.all({}, { order: '-publishedAt' });
  const it1 = result[Symbol.asyncIterator]();
  const it2 = result[Symbol.asyncIterator]();

  const seen1 = [];
  const seen2 = [];

  let r1 = await it1.next();
  let r2 = await it2.next();

  while (!r1.done || !r2.done) {
    if (!r1.done) {
      seen1.push(r1.value.uri);
      r1 = await it1.next();
    }

    if (!r2.done) {
      seen2.push(r2.value.uri);
      r2 = await it2.next();
    }
  }

  assert.deepEqual(seen1, ['2026/04/c', '2026/04/b', '2026/04/a']);
  assert.deepEqual(seen2, ['2026/04/c', '2026/04/b', '2026/04/a']);

  await storage.close();
});

test('next()/prev() navigate equal-timestamp siblings by uri tiebreak', async () => {
  const blog = makeBlog();
  await blog.open();
  try {
    const at = I('2026-04-01T00:00:00Z');
    const a = await blog.create({ title: 'A', text: '.', status: 'published', publishedAt: at });
    const b = await blog.create({ title: 'B', text: '.', status: 'published', publishedAt: at });
    assert.ok(a.uri < b.uri, 'fixture assumes 2026/04/a < 2026/04/b');

    const aNext = await a.next();
    const bPrev = await b.prev();
    assert.equal(aNext?.uri, b.uri, 'next() crosses to the same-instant sibling');
    assert.equal(bPrev?.uri, a.uri, 'prev() crosses back to the same-instant sibling');
    assert.equal(await b.next(), null);
    assert.equal(await a.prev(), null);
  } finally {
    await blog[Symbol.asyncDispose]();
  }
});

test('traversals started after close reject as not open', async () => {
  const storage = sqlite();
  await storage.open();
  const posts = storage.all();
  const entries = storage.entries();
  await storage.close();

  await assert.rejects(Array.fromAsync(posts), { code: 'YAMB_STORAGE_NOT_OPEN' });
  await assert.rejects(Array.fromAsync(entries), { code: 'YAMB_STORAGE_NOT_OPEN' });
});

test('close() with an already-aborted signal still closes the db (no leak)', async () => {
  const storage = sqlite();
  await storage.open({ timeZone: 'UTC', clock: () => I('2026-04-01T00:00:00Z') });

  const controller = new AbortController();
  controller.abort();

  await storage.close({ signal: controller.signal });

  const state = getState(storage);
  assert.equal(state.db, null, 'the db handle must be closed and nulled, not leaked');
});
