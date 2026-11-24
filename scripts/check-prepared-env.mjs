import { DatabaseSync } from 'node:sqlite';

import { sqlite } from 'yamb-storage-sqlite';

const path = process.env.YAMB_SQLITE_FIXTURE;

if (!path) {
  throw new Error('YAMB_SQLITE_FIXTURE must point to an existing prepared database');
}

const inspector = new DatabaseSync(path, { readOnly: true });

try {
  const count = inspector.prepare('SELECT count(*) AS n FROM posts').get().n;

  if (count !== 0) {
    throw new Error('Prepared SQLite posts must be empty before integrations');
  }

  console.log({
    database: 'SQLite',
    indexes: inspector
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'posts'")
      .all().length,
    rows: count
  });
} finally {
  inspector.close();
}

const sqliteStorage = sqlite({ path });

try {
  await sqliteStorage.open();
} finally {
  await sqliteStorage.close();
}
