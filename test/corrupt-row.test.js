import assert from 'node:assert/strict';

import { getState } from '../src/storage/internal.js';
import { sqlite, test, own } from './prepared-sqlite.js';

const ctx = { timeZone: 'UTC', clock: () => Temporal.Instant.from('2026-04-26T12:00:00Z') };

async function withCorruptRow(fn) {
  const storage = sqlite();
  await storage.open(ctx);
  const state = getState(storage);

  own('id-corrupt');
  state.statements.insert.run(
    'id-corrupt',
    '2026/04/corrupt',
    'corrupt',
    'T',
    'published',
    '2026-04-26T12:00:00.000000000Z',
    '2026-04-26T10:00:00.000000000Z',
    '2026-04-26T10:00:00.000000000Z',
    '[]',
    '[]',
    '{ this is not valid json'
  );

  try {
    await fn(storage);
  } finally {
    await storage.close();
  }
}

test('find() on a corrupt raw_json row throws StorageReadError, not bare SyntaxError', async () => {
  await withCorruptRow(async (storage) => {
    await assert.rejects(() => storage.find('id-corrupt'), { code: 'YAMB_STORAGE_READ' });
  });
});

test('fetch() on a corrupt raw_json row throws StorageReadError', async () => {
  await withCorruptRow(async (storage) => {
    await assert.rejects(() => storage.fetch('2026/04/corrupt'), { code: 'YAMB_STORAGE_READ' });
  });
});

test('all() surfaces a corrupt raw_json row as StorageReadError', async () => {
  await withCorruptRow(async (storage) => {
    await assert.rejects(
      async () => {
        for await (const r of storage.all({}, { order: '-publishedAt' })) {
          void r;
        }
      },
      { code: 'YAMB_STORAGE_READ' }
    );
  });
});
