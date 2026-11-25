import assert from 'node:assert/strict';
import { access, mkdtempDisposable } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { SqliteConfigError, SqliteOpenError } from '../src/errors/index.js';
import { sqlite, SqliteStorage } from '../src/index.js';

test('valid config with an existing database path is accepted', () => {
  const storage = sqlite({ path: '/prepared/posts.db' });
  assert.ok(storage instanceof SqliteStorage);
});

test('existing database config accepts the default read/write mode', () => {
  const storage = sqlite({ path: '/prepared/posts.db' });
  assert.ok(storage);
});

test('empty path throws SqliteConfigError', () => {
  assert.throws(
    () => sqlite({ path: '' }),
    (err) => err instanceof SqliteConfigError && err.code === 'YAMB_SQLITE_CONFIG'
  );
});

test('missing path throws SqliteConfigError', () => {
  assert.throws(
    () => sqlite({}),
    (err) => err.code === 'YAMB_SQLITE_CONFIG'
  );
});

test('unknown config key is rejected (strictObject)', () => {
  assert.throws(
    () => sqlite({ path: '/prepared/posts.db', unknown: true }),
    (err) => err.code === 'YAMB_SQLITE_CONFIG'
  );
});

test('non-boolean readonly throws SqliteConfigError', () => {
  assert.throws(
    () => sqlite({ path: '/prepared/posts.db', readonly: 'yes' }),
    (err) => err.code === 'YAMB_SQLITE_CONFIG'
  );
});

test('error details include parsing issues', () => {
  try {
    sqlite({ path: 123 });
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'YAMB_SQLITE_CONFIG');
    assert.ok(Array.isArray(err.details.issues));
    assert.ok(err.details.issues.length > 0);
  }
});

test('open() of a missing file throws SqliteOpenError and creates nothing', async () => {
  await using dir = await mkdtempDisposable(join(tmpdir(), 'yamb-sqlite-'));

  for (const readonly of [false, true]) {
    const path = join(dir.path, 'missing.db');

    await assert.rejects(
      () => sqlite({ path, readonly }).open(),
      (err) =>
        err instanceof SqliteOpenError &&
        err.code === 'YAMB_SQLITE_OPEN' &&
        err.cause?.errcode === 14
    );
    await assert.rejects(access(path), { code: 'ENOENT' });
  }
});

test('operations before open reject without reading or writing any record', async () => {
  const storage = sqlite({ path: '/prepared/posts.db' });
  for (const operation of [
    () => storage.find('507f1f77bcf86cd799439011'),
    () => storage.fetch('2026/04/absent'),
    () => storage.save({ title: 'Unopened' }),
    () => storage.remove('507f1f77bcf86cd799439011'),
    () => storage.sync(),
    () => storage.count({}),
    async () => Array.fromAsync(storage.all({})),
    async () => Array.fromAsync(storage.entries())
  ]) {
    await assert.rejects(operation, { code: 'YAMB_STORAGE_NOT_OPEN' });
  }
});
