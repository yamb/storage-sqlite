import { randomUUIDv7 } from 'node:crypto';

import { StorageNotOpenError, StorageDuplicateError, StorageWriteError } from '#core/errors';

import { getState } from '../internal.js';
import { mismatch } from './mismatch.js';

const SQLITE_CONSTRAINT_UNIQUE = 2067;

function omitUndefined(raw) {
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined));
}

function rowParams(id, raw) {
  const fields = {
    id,
    uri: raw.uri,
    slug: raw.slug,
    title: raw.title,
    status: raw.status,
    publishedAt: raw.publishedAt ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt
  };

  for (const [field, value] of Object.entries(fields)) {
    if (typeof value === 'string' && !value.isWellFormed()) {
      throw new StorageWriteError(`${field} must be well-formed Unicode`, {
        details: { field }
      });
    }
  }

  return [
    ...Object.values(fields),
    JSON.stringify(raw.tags ?? []),
    JSON.stringify(raw.links?.related ?? []),
    JSON.stringify({ ...raw, id })
  ];
}

export default {
  name: 'save',

  async fn(storage, raw, options = {}) {
    const state = getState(storage);

    if (!state.db) {
      throw new StorageNotOpenError();
    }

    const { signal, expected } = options;

    signal?.throwIfAborted();

    const isInsert = !raw.id;
    const id = raw.id ?? randomUUIDv7();
    const { statements } = state;

    try {
      if (isInsert) {
        statements.insert.run(...rowParams(id, raw));
      } else {
        const [, ...params] = rowParams(id, raw);
        const result =
          expected === undefined
            ? statements.update.run(...params, id)
            : statements.updateIf.run(...params, id, expected);

        if (result.changes === 0) {
          throw mismatch(state, id, expected);
        }
      }
    } catch (cause) {
      if (cause.code?.startsWith('YAMB_')) {
        throw cause;
      }

      if (cause.errcode === SQLITE_CONSTRAINT_UNIQUE) {
        throw new StorageDuplicateError(`uri "${raw.uri}" duplicate`, {
          cause
        });
      }

      throw new StorageWriteError(`sqlite write failed: ${cause.message}`, {
        cause
      });
    }

    return omitUndefined({ ...raw, id });
  }
};
