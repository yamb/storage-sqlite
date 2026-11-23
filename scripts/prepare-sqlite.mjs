import assert from 'node:assert/strict';
import { appendFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');

const folder = await mkdtemp(join(process.env.RUNNER_TEMP, 'yamb-sqlite-'));
const fixture = join(folder, 'posts.db');
using db = new DatabaseSync(fixture);

db.exec(`
  CREATE TABLE posts (
    id TEXT PRIMARY KEY NOT NULL,
    uri TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    publishedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    related_json TEXT NOT NULL,
    raw_json TEXT NOT NULL
  )
`);

await appendFile(process.env.GITHUB_ENV, `YAMB_SQLITE_FIXTURE=${fixture}\n`);
