import assert from 'node:assert/strict';

import { sqlite as createStorage, test } from './prepared-sqlite.js';

const instant = '2026-04-26T12:00:00.000000000Z';
const raw = (slug, overrides = {}) => ({
  uri: `2026/04/${slug}`,
  slug,
  title: slug,
  text: '**original**',
  status: 'published',
  tags: ['intro', 'meta'],
  links: { related: [] },
  options: {},
  createdAt: instant,
  updatedAt: instant,
  publishedAt: instant,
  ...overrides
});

test('insert, replace, rename and remove preserve identity and cleared fields', async () => {
  const storage = createStorage();
  await storage.open();

  const saved = await storage.save(raw('original', { cover: { url: '/cover.jpg' } }));
  const target = await storage.save(raw('target'));

  const { cover: _cover, ...withoutCover } = saved;
  const updated = await storage.save({
    ...withoutCover,
    title: 'Updated',
    links: { related: [target.id] }
  });
  assert.equal(updated.id, saved.id);
  const loaded = await storage.fetch(saved.uri);
  assert.equal(loaded.title, 'Updated');
  assert.equal(loaded.cover, undefined);
  assert.deepEqual(loaded.links.related, [target.id]);

  await storage.save({ ...updated, uri: '2026/04/renamed', slug: 'renamed' });
  assert.equal(await storage.fetch(saved.uri), null);
  const renamed = await storage.find(saved.id);
  assert.equal(renamed.uri, '2026/04/renamed');

  await assert.rejects(() => storage.save({ ...renamed, uri: target.uri }), {
    code: 'YAMB_STORAGE_DUPLICATE'
  });

  await storage.remove(saved.id);
  assert.equal(await storage.find(saved.id), null);
  await assert.rejects(() => storage.remove(saved.id), { code: 'YAMB_POST_NOT_FOUND' });

  await storage.close();
  await storage.open();
  const reopened = await storage.find(target.id);
  assert.equal(reopened.title, 'target');
});

test('undefined fields are omitted on insert and full replacement', async () => {
  const storage = createStorage();
  await storage.open();

  const saved = await storage.save(raw('cleared', { cover: undefined }));
  const inserted = await storage.find(saved.id);
  assert.equal(Object.hasOwn(inserted, 'cover'), false);

  await storage.save({ ...saved, cover: { url: '/cover.jpg' } });
  await storage.save({ ...saved, cover: undefined });
  const updated = await storage.find(saved.id);
  assert.equal(Object.hasOwn(updated, 'cover'), false);
});

test('tag intersections, time bounds, exact URI and pagination execute in storage', async () => {
  const storage = createStorage();
  await storage.open();

  const a = await storage.save(raw('aaa'));
  await storage.save(raw('bbb'));
  await storage.save(
    raw('ccc', { tags: ['other'], publishedAt: '2026-04-27T12:00:00.000000000Z' })
  );
  await storage.save(raw('draft', { status: 'draft' }));

  assert.equal(await storage.count({}), 4);
  assert.equal(await storage.count({ status: 'published', tag: 'intro', tags: ['meta'] }), 2);
  assert.equal(await storage.count({ tag: 'intro', tags: ['other'] }), 0);

  const before = await Array.fromAsync(
    storage.all({ status: 'published', before: Temporal.Instant.from('2026-04-27T00:00:00Z') })
  );
  assert.deepEqual(
    before.map((p) => p.slug),
    ['bbb', 'aaa']
  );

  const after = await Array.fromAsync(
    storage.all({ after: Temporal.Instant.from('2026-04-27T00:00:00Z') })
  );
  assert.deepEqual(
    after.map((p) => p.slug),
    ['ccc']
  );

  const exact = await Array.fromAsync(storage.all({ uri: a.uri }));
  assert.deepEqual(
    exact.map((p) => p.id),
    [a.id]
  );

  const page = await Array.fromAsync(
    storage.all({ status: 'published' }, { order: '-publishedAt', offset: 1, limit: 1 })
  );
  assert.deepEqual(
    page.map((p) => p.slug),
    ['bbb']
  );

  const zero = await Array.fromAsync(storage.all({}, { limit: 0 }));
  assert.deepEqual(zero, []);

  const remainder = await Array.fromAsync(
    storage.all({ status: 'published' }, { order: '-publishedAt', offset: 1, limit: null })
  );
  assert.deepEqual(
    remainder.map((p) => p.slug),
    ['bbb', 'aaa']
  );

  const cursor = { publishedAt: a.publishedAt, uri: a.uri };
  const forward = await Array.fromAsync(
    storage.all({ status: 'published', cursor }, { order: 'publishedAt' })
  );
  assert.deepEqual(
    forward.map((p) => p.slug),
    ['bbb', 'ccc']
  );

  const backward = await Array.fromAsync(
    storage.all(
      { status: 'published', cursor: { ...cursor, uri: '2026/04/bbb' } },
      { order: '-publishedAt' }
    )
  );
  assert.deepEqual(
    backward.map((p) => p.slug),
    ['aaa']
  );
});

test('invalid standalone reads and queries fail without exposing records', async () => {
  const storage = createStorage();
  await storage.open();

  await assert.rejects(() => storage.find({ $ne: null }), { code: 'YAMB_STORAGE_READ' });
  await assert.rejects(() => storage.fetch({ $ne: null }), { code: 'YAMB_STORAGE_READ' });

  for (const query of [{ status: '' }, { tag: '' }, { uri: '' }]) {
    await assert.rejects(async () => Array.fromAsync(storage.all(query)), {
      code: 'YAMB_QUERY_VALIDATION'
    });
  }

  for (const options of [{ limit: '5' }, { limit: 2.5 }, { offset: '2' }]) {
    await assert.rejects(async () => Array.fromAsync(storage.all({}, options)), {
      code: 'YAMB_QUERY_VALIDATION'
    });
  }
});
