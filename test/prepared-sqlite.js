import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import nodeTest from 'node:test';

import { sqlite as createStorage } from '@meritt/yamb-storage-sqlite';

export const path = process.env.YAMB_SQLITE_FIXTURE;
const owned = new Set();
const storages = new Set();

export function own(id) {
  owned.add(id);

  return id;
}

export function sqlite(config = {}) {
  const storage = createStorage({ path, ...config });
  const save = storage.save.bind(storage);

  Object.defineProperty(storage, 'save', {
    value: async (...args) => {
      const result = await save(...args);
      own(result.id);

      return result;
    }
  });
  storages.add(storage);

  return storage;
}

export function test(name, fn) {
  return nodeTest(name, async (t) => {
    if (!path) {
      t.skip('requires YAMB_SQLITE_FIXTURE with prepared posts structure');
      return;
    }

    const inspector = new DatabaseSync(path, { readOnly: true });

    try {
      assert.equal(
        inspector.prepare('SELECT count(*) AS n FROM posts').get().n,
        0,
        'prepared SQLite must be empty before this scenario'
      );
    } finally {
      inspector.close();
    }

    try {
      await fn(t);
    } finally {
      for (const storage of storages) {
        await storage.close();
      }
      storages.clear();

      if (owned.size) {
        const db = new DatabaseSync(path);

        try {
          const remove = db.prepare('DELETE FROM posts WHERE id = ?');

          for (const id of owned) {
            remove.run(id);
          }
        } finally {
          db.close();
          owned.clear();
        }
      }
    }
  });
}
