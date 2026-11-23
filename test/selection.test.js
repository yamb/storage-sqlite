import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

import { yamb } from 'yamb';
import { z } from 'zod';

import { sqlite } from '../src/index.js';
import { test } from './prepared-sqlite.js';

const path = process.env.YAMB_SQLITE_FIXTURE;
const instant = '2026-11-01T12:00:00.000000000Z';
const cases = [
  { status: 'published', publishedAt: instant },
  { status: 'draft', homepage: false },
  { status: 'scheduled', publishedAt: instant, homepage: true },
  { status: 'archived', homepage: null }
];

test('SQLite selection, default filters, pagination and cache survive save/reload on prepared structure', async () => {
  assert.ok(path, 'YAMB_SQLITE_FIXTURE must name the prepared database');
  await access(path);
  const inspector = new DatabaseSync(path, { readOnly: true });
  assert.equal(inspector.prepare('SELECT count(*) AS n FROM posts').get().n, 0);
  inspector.close();

  const storage = sqlite({ path });
  const blog = yamb({
    storage,
    options: z
      .strictObject({
        homepage: z.boolean().nullable().default(false),
        kind: z.string(),
        score: z.number().optional()
      })
      .refine((value) => value.kind === 'article'),
    clock: () => Temporal.Instant.from(instant)
  });
  const ids = [];
  await blog.open();

  try {
    for (let i = 0; i < 12; i++) {
      const { status, publishedAt, homepage } = cases[i % cases.length];
      const slug = `article-${String(i).padStart(2, '0')}`;
      const directory = publishedAt === undefined ? 'drafts' : '2026/11';
      const options = { kind: 'article', score: i % 2 };

      if (homepage !== undefined) {
        options.homepage = homepage;
      }

      const post = {
        uri: `${directory}/${slug}`,
        slug,
        title: `Article ${i}`,
        text: '**selection**',
        status,
        createdAt: instant,
        updatedAt: instant,
        tags: ['article'],
        meta: { description: 'Original description' },
        links: { related: [] },
        options
      };

      if (publishedAt !== undefined) {
        post.publishedAt = publishedAt;
      }

      const raw = await storage.save(post);
      ids.push(raw.id);
    }

    await blog.sync();

    const all = await blog.all().toArray();
    assert.equal(all.length, 12);
    assert.deepEqual(
      all.map((p) => p.title),
      [
        'Article 10',
        'Article 8',
        'Article 6',
        'Article 4',
        'Article 2',
        'Article 0',
        'Article 11',
        'Article 9',
        'Article 7',
        'Article 5',
        'Article 3',
        'Article 1'
      ]
    );

    const ascending = await blog.all({}, { order: 'publishedAt' }).toArray();
    assert.deepEqual(
      ascending.map((p) => p.title),
      [
        'Article 1',
        'Article 3',
        'Article 5',
        'Article 7',
        'Article 9',
        'Article 11',
        'Article 0',
        'Article 2',
        'Article 4',
        'Article 6',
        'Article 8',
        'Article 10'
      ]
    );

    const published = await blog.published.toArray();
    assert.equal(published.length, 3);

    const withoutHomepage = blog.all({ options: { homepage: false } });
    const falsePosts = await withoutHomepage.toArray();
    assert.equal(falsePosts.length, 6);
    assert.ok(falsePosts.every((p) => p.options.homepage === false));
    assert.equal(await withoutHomepage.limit(0).offset(99).count(), 6);
    assert.equal(await withoutHomepage.limit(0).first(), null);
    assert.equal(await blog.all({ options: { homepage: true } }).count(), 3);
    assert.equal(await blog.all({ options: { homepage: null } }).count(), 3);
    assert.equal(await blog.all({ options: { homepage: false, score: 0 } }).count(), 3);
    assert.equal(await blog.all({ options: { kind: 'other' } }).count(), 0);
    assert.equal(await blog.all({ options: { kind: '$options.kind' } }).count(), 0);
    const page = await withoutHomepage.offset(1).limit(2).toArray();
    const first = await withoutHomepage.offset(1).first();
    assert.equal(first.id, page[0].id);

    const firstIterator = blog.all()[Symbol.asyncIterator]();
    const secondIterator = blog.all()[Symbol.asyncIterator]();
    const firstStep = await firstIterator.next();
    const secondStep = await secondIterator.next();
    assert.equal(firstStep.value.id, secondStep.value.id);
    await firstIterator.return();
    await secondIterator.return();

    const post = await blog.find(ids[0]);
    const cache = new Map([[post.hash(), post.toJSON()]]);
    await post.save();
    const reloaded = await blog.find(post.id);
    assert.deepEqual(cache.get(reloaded.hash()), reloaded.toJSON());

    reloaded.options.homepage = true;
    assert.equal(cache.has(reloaded.hash()), false);
    reloaded.meta.description = 'Edited description';
    reloaded.text = '**Source**';
    await reloaded.save();
    const after = await blog.find(post.id);
    assert.equal(after.options.homepage, true);
    assert.equal(after.meta.description, 'Edited description');
    assert.equal(after.text, '**Source**');
    assert.equal(after.hash(), reloaded.hash());
    assert.equal(await withoutHomepage.count(), 5);
    assert.equal(await blog.all({ options: { homepage: true } }).count(), 4);

    for (const options of [{ 'a.b': false }, { $where: true }, { homepage: { $ne: null } }]) {
      await assert.rejects(async () => Array.fromAsync(storage.all({ options })), {
        code: 'YAMB_QUERY_VALIDATION'
      });
      await assert.rejects(() => storage.count({ options }), { code: 'YAMB_QUERY_VALIDATION' });
    }

    const removed = await blog.find(ids[1]);
    const other = new DatabaseSync(path);
    other.prepare('DELETE FROM posts WHERE id = ?').run(removed.id);
    other.close();

    removed.title = 'Must stay deleted';
    await assert.rejects(() => removed.save(), { code: 'YAMB_POST_NOT_FOUND' });
    assert.equal(await storage.find(removed.id), null);
    ids.splice(ids.indexOf(removed.id), 1);
  } finally {
    for (const id of ids) {
      await storage.remove(id);
    }
    await blog.close();
  }
});

test('SQLite cursors close after early exit, callback failure, take and native abort reason', async () => {
  assert.ok(path);
  await access(path);
  const storage = sqlite({ path });
  const blog = yamb({ storage });
  const ids = [];
  await blog.open();

  try {
    for (let i = 0; i < 3; i++) {
      const p = await blog.create({ title: `Cursor ${i}`, text: 'cursor' });
      ids.push(p.id);
    }

    for await (const p of blog.all()) {
      assert.ok(p.id);
      break;
    }

    const error = new Error('callback');
    await assert.rejects(
      () =>
        blog
          .all()
          .map(() => {
            throw error;
          })
          .toArray(),
      (e) => e === error
    );

    const taken = await Array.fromAsync(blog.all().take(1));
    assert.equal(taken.length, 1);

    const controller = new AbortController();
    const reason = { stop: 'selection' };
    const iterator = blog.all({}, { signal: controller.signal })[Symbol.asyncIterator]();
    await iterator.next();
    controller.abort(reason);
    await assert.rejects(
      () => iterator.next(),
      (e) => e === reason
    );
    const exhausted = await iterator.next();
    assert.equal(exhausted.done, true);

    const raw = storage.all()[Symbol.asyncIterator]();
    await raw.next();
    await raw.return();
    const returned = await raw.next();
    assert.equal(returned.done, true);
    assert.equal(await blog.all().count(), 3);
  } finally {
    for (const id of ids) {
      await storage.remove(id);
    }
    await blog.close();
  }
});

test('SQLite exact option comparisons retain JSON types and literal strings', async () => {
  assert.ok(path);
  await access(path);
  const storage = sqlite({ path });
  const blog = yamb({
    storage,
    options: z.strictObject({
      value: z
        .union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.boolean())])
        .optional()
    })
  });
  const ids = [];
  await blog.open();
  try {
    for (const [i, value] of [
      false,
      true,
      0,
      1,
      '1',
      null,
      [true],
      undefined,
      "'; --",
      '$options.value'
    ].entries()) {
      const raw = await storage.save({
        uri: `drafts/scalar-${i}`,
        slug: `scalar-${i}`,
        title: `Scalar ${i}`,
        text: 'literal',
        status: 'draft',
        tags: [],
        links: { related: [] },
        createdAt: instant,
        updatedAt: instant,
        options: value === undefined ? {} : { value }
      });
      ids.push(raw.id);
    }

    for (const value of [false, true, 0, 1, '1', null, "'; --", '$options.value']) {
      const matches = await blog.all({ options: { value } }).toArray();
      assert.equal(matches.length, 1);
      assert.equal(matches[0].options.value, value);
      assert.equal(await blog.all({ options: { value } }).limit(0).count(), 1);
    }
  } finally {
    for (const id of ids) {
      await storage.remove(id);
    }
    await blog.close();
  }
});
