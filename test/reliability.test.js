import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { yamb } from 'yamb';

import { sqlite, test as sqliteTest, path } from './prepared-sqlite.js';

sqliteTest('SQLite rejects non-object decoded roots on every read path', async () => {
  const storage = sqlite();
  const blog = yamb({ storage });
  await blog.open();
  const db = new DatabaseSync(path);

  try {
    const post = await blog.create({ title: 'Root boundary' });
    const original = db.prepare('SELECT raw_json FROM posts WHERE id = ?').get(post.id).raw_json;

    for (const value of [null, [], 'scalar', 1, true]) {
      db.prepare('UPDATE posts SET raw_json = ? WHERE id = ?').run(JSON.stringify(value), post.id);
      await assert.rejects(storage.find(post.id), { code: 'YAMB_STORAGE_READ' });
      await assert.rejects(storage.fetch(post.uri), { code: 'YAMB_STORAGE_READ' });
      await assert.rejects(Array.fromAsync(storage.all({})), { code: 'YAMB_STORAGE_READ' });
    }

    db.prepare('UPDATE posts SET raw_json = ? WHERE id = ?').run(original, post.id);
    const stored = await blog.find(post.id);
    assert.equal(stored.title, 'Root boundary');
  } finally {
    await blog.close();
    db.close();
  }
});

sqliteTest('SQLite large tag filters retain AND, literal and empty-set semantics', async () => {
  const blog = yamb({ storage: sqlite() });
  await blog.open();

  try {
    await blog.create({ title: 'Tagged', tags: ['one', 'x" OR 1=1 --'] });
    await blog.create({ title: 'Other', tags: ['other'] });

    for (const [tags, count] of [
      [[], 2],
      [Array(1001).fill('one'), 1],
      [Array.from({ length: 1001 }, (_, n) => `unique-${n}`), 0],
      [['one', 'other'], 0],
      [['x" OR 1=1 --'], 1]
    ]) {
      assert.equal(await blog.all({ tags }).count(), count);
      const posts = await blog.all({ tags }).toArray();
      assert.equal(posts.length, count);
    }
  } finally {
    await blog.close();
  }
});
