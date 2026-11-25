import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { yamb } from 'yamb';
import { z } from 'zod';

import { sqlite, test, path, own } from './prepared-sqlite.js';

const instant = '2026-11-01T00:00:00.000000000Z';
const raw = (slug, extra = {}) => ({
  uri: `drafts/${slug}`,
  slug,
  title: slug,
  status: 'draft',
  createdAt: instant,
  updatedAt: instant,
  publishedAt: instant,
  tags: [],
  options: {},
  text: '',
  ...extra
});

async function rejectsQuery(storage, query) {
  await assert.rejects(storage.count(query), { code: 'YAMB_QUERY_VALIDATION' });
  assert.throws(() => storage.all(query), { code: 'YAMB_QUERY_VALIDATION' });
}

test('flat strings reject lone surrogates before insert or replacement', async () => {
  const storage = sqlite();
  await storage.open();
  const saved = await storage.save(raw('original'));

  for (const field of ['uri', 'slug', 'title', 'status', 'createdAt', 'updatedAt', 'publishedAt']) {
    const value = `x\ud800z`;
    await assert.rejects(storage.save({ ...saved, [field]: value }), {
      code: 'YAMB_STORAGE_WRITE'
    });
    assert.deepEqual(await storage.find(saved.id), saved);
    assert.deepEqual(await Array.fromAsync(storage.entries()), [[saved.id, saved.uri]]);

    await assert.rejects(storage.save(raw('insert', { [field]: value })), {
      code: 'YAMB_STORAGE_WRITE'
    });
    assert.equal(await storage.fetch('drafts/insert'), null);
  }
  assert.equal(await storage.count(), 1);

  const value = 'x\0😀z';
  const valid = await storage.save(raw(value, { title: value, status: value }));
  const loaded = await storage.fetch(valid.uri);
  assert.equal(loaded.title, value);
  assert.equal(loaded.status, value);
  assert.deepEqual(await storage.find(valid.id), loaded);
});

test('malformed native keys match nothing and never alias replacement characters', async () => {
  const storage = sqlite();
  await storage.open();
  const saved = await storage.save(raw('�', { status: '�', publishedAt: '�' }));
  const db = new DatabaseSync(path);
  const notFound = { code: 'YAMB_POST_NOT_FOUND' };

  try {
    const id = 'x�z';
    db.prepare('UPDATE posts SET id = ?, raw_json = ? WHERE id = ?').run(
      id,
      JSON.stringify({ ...saved, id }),
      saved.id
    );
    own(id);
    const stored = await storage.find(id);

    assert.equal(await storage.find('x\ud800z'), null);
    assert.equal(await storage.fetch('drafts/\ud800'), null);

    for (const expected of [undefined, null, 'v1']) {
      await assert.rejects(
        storage.save({ ...stored, id: 'x\ud800z', title: 'Replaced' }, { expected }),
        notFound
      );
      await assert.rejects(storage.remove('x\ud800z', { expected }), notFound);
      await assert.rejects(storage.fence('x\ud800z', 'v2', { expected }), notFound);
    }

    assert.deepEqual(await storage.find(id), stored);

    for (const query of [
      { uri: 'drafts/\ud800' },
      { status: '\ud800' },
      { before: '\ud800' },
      { after: '\ud800' },
      { cursor: { publishedAt: '\ud800', uri: saved.uri } },
      { cursor: { publishedAt: instant, uri: 'drafts/\ud800' } }
    ]) {
      await rejectsQuery(storage, query);
    }
  } finally {
    db.close();
  }
});

test('JSON scalar strings retain exact tag, option and default selection', async () => {
  const storage = sqlite();
  const blog = yamb({ storage, options: z.object({ value: z.string().default('x\ud800z') }) });
  await blog.open();

  for (const [n, value] of ['x\ud800z', 'x\udc00z', 'x�z', 'x\0z', 'x😀z', ''].entries()) {
    await blog.create({ title: `Value ${n}`, tags: value ? [value] : [], options: { value } });
  }

  const defaultPost = await blog.create({ title: 'Default' });
  await storage.save({ ...defaultPost.toJSON(), options: {} });

  for (const value of ['x\ud800z', 'x\udc00z', 'x�z', 'x\0z', 'x😀z', '']) {
    const count = value === 'x\ud800z' ? 2 : 1;
    assert.equal(await blog.all({ options: { value } }).count(), count);
    const posts = await blog.all({ options: { value } }).toArray();
    assert.equal(posts.length, count);

    if (value) {
      assert.equal(await blog.all({ tags: [value] }).count(), 1);
    }
  }
});

test('JSON-only fields and keys preserve lone surrogates across replacement and reopen', async () => {
  const storage = sqlite();
  await storage.open();
  const value = 'x\ud800z\0😀';
  const saved = await storage.save(
    raw('json', {
      text: value,
      preview: value,
      cover: { caption: value, alt: value },
      options: { [value]: { nested: [value] } },
      tags: [value],
      links: { related: [value] }
    })
  );

  await storage.close();
  await storage.open();
  assert.deepEqual(await storage.find(saved.id), saved);

  const changed = { ...saved, cover: { caption: `${value}!` }, options: { [value]: false } };
  await storage.save(changed);
  assert.deepEqual(await storage.fetch(saved.uri), changed);
});

test('invalid provided tags fail before SQL without narrowing valid array semantics', async () => {
  const storage = sqlite();
  await storage.open();
  await storage.save(raw('one', { tags: ['one', '😀'.repeat(32)] }));
  await storage.save(raw('two', { tags: ['two'] }));

  for (const tags of [
    null,
    'one',
    { value: 'one' },
    [null],
    [1],
    [false],
    [{}],
    [''],
    ['x'.repeat(65)],
    ['😀'.repeat(33)],
    Array(1)
  ]) {
    await rejectsQuery(storage, { tags });
  }

  for (const [tags, count] of [
    [[], 2],
    [['one'], 1],
    [Array(50).fill('one'), 1],
    [['😀'.repeat(32)], 1]
  ]) {
    assert.equal(await storage.count({ tags }), count);
    const posts = await Array.fromAsync(storage.all({ tags }));
    assert.equal(posts.length, count);
  }
});

test('index traversals and concurrent sync complete independently', async () => {
  const storage = sqlite();
  const blog = yamb({ storage });
  await blog.open();
  const ids = [];

  for (let n = 0; n < 3; n++) {
    const post = await blog.create({ title: `Index ${n}` });
    ids.push(post.id);
  }

  const iterable = storage.entries();
  const a = iterable[Symbol.asyncIterator]();
  const b = iterable[Symbol.asyncIterator]();

  try {
    const gotA = [];
    const gotB = [];

    for (let n = 0; n < 3; n++) {
      const first = await a.next();
      const second = await b.next();
      gotA.push(first.value[0]);
      gotB.push(second.value[0]);
    }

    const endA = await a.next();
    const endB = await b.next();
    assert.equal(endA.done, true);
    assert.equal(endB.done, true);
    assert.deepEqual(gotA.toSorted(), ids.toSorted());
    assert.deepEqual(gotB.toSorted(), ids.toSorted());

    await Promise.all([blog.sync(), blog.sync()]);
    assert.equal(await blog.all().count(), 3);
  } finally {
    await a.return();
    await b.return();
  }
});

test('return and abort release only their own index traversal', async () => {
  const storage = sqlite();
  await storage.open();
  const saved = await storage.save(raw('lock-one'));
  await storage.save(raw('lock-two'));

  const db = new DatabaseSync(path);

  try {
    for (const reason of [undefined, NaN, 0, false, 'stop', null]) {
      const ac = new AbortController();
      const a = storage.entries({ signal: ac.signal })[Symbol.asyncIterator]();
      const b = storage.entries()[Symbol.asyncIterator]();

      try {
        const firstA = await a.next();
        const firstB = await b.next();
        assert.equal(firstA.done, false);
        assert.equal(firstB.done, false);

        if (reason === undefined) {
          await a.return();
        } else {
          ac.abort(reason);
          await assert.rejects(a.next(), (error) => Object.is(error, reason));
        }

        const endA = await a.next();
        assert.equal(endA.done, true);

        assert.throws(
          () => db.prepare('UPDATE posts SET title=title WHERE id=?').run(saved.id),
          (error) => error.errcode === 5
        );

        const secondB = await b.next();
        assert.equal(secondB.done, false);

        await b.return();
        db.prepare('UPDATE posts SET title=title WHERE id=?').run(saved.id);
      } finally {
        await a.return();
        await b.return();
      }
    }

    await assert.rejects(async () => {
      for await (const _entry of storage.entries()) {
        throw new Error('consumer');
      }
    }, /consumer/);
    db.prepare('UPDATE posts SET title=title WHERE id=?').run(saved.id);
  } finally {
    db.close();
  }
});

test('remove normalizes native write failures and preserves missing and preabort errors', async () => {
  const storage = sqlite();
  await storage.open();
  const saved = await storage.save(raw('remove'));

  const readonly = sqlite({ readonly: true });
  await readonly.open();
  await assert.rejects(
    readonly.remove(saved.id),
    (error) => error.code === 'YAMB_STORAGE_WRITE' && error.cause.errcode === 8
  );

  const db = new DatabaseSync(path);

  try {
    db.exec('BEGIN IMMEDIATE');
    await assert.rejects(
      storage.remove(saved.id),
      (error) => error.code === 'YAMB_STORAGE_WRITE' && error.cause.errcode === 5
    );
    assert.deepEqual(await storage.find(saved.id), saved);
  } finally {
    db.exec('ROLLBACK');
    db.close();
  }

  for (const reason of [NaN, 0, false, 'stop', null]) {
    await assert.rejects(storage.remove(saved.id, { signal: AbortSignal.abort(reason) }), (error) =>
      Object.is(error, reason)
    );
  }

  await storage.remove(saved.id);
  await assert.rejects(storage.remove(saved.id), { code: 'YAMB_POST_NOT_FOUND' });
});
