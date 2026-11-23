import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';

import { yamb } from 'yamb';
import { z } from 'zod';

import { test as sqliteTest } from './prepared-sqlite.js';

sqliteTest(
  'prepared SQLite persists options and defaults using the existing document column',
  async (t) => {
    const path = process.env.YAMB_SQLITE_FIXTURE;

    if (!path) {
      t.skip('requires the prepared SQLite fixture');
      return;
    }

    await access(path);
    const { sqlite } = await import('@meritt/yamb-storage-sqlite');
    const blog = yamb({
      storage: sqlite({ path }),
      options: z.strictObject({ homepage: z.boolean().default(false) })
    });
    await blog.open();
    let post;

    try {
      post = await blog.create({ title: `Options ${crypto.randomUUID()}` });
      post.options.homepage = true;
      await post.save();

      const loaded = await blog.find(post.id);
      assert.deepEqual(loaded.toJSON().options, { homepage: true });
      assert.deepEqual(loaded.changes(), {});
    } finally {
      try {
        if (post?.id) {
          await post.remove();
        }
      } finally {
        await blog.close();
      }
    }
  }
);
