import { randomUUIDv7 } from 'node:crypto';

import { StorageWriteError } from '#core/errors';

import { openState } from '../internal.js';
import { storable } from './key.js';
import { missing, write } from './write.js';

function omitUndefined(raw) {
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined));
}

function columns(raw) {
  const fields = {
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
    JSON.stringify(raw)
  ];
}

export default {
  name: 'save',

  async fn(storage, input, options = {}) {
    const state = openState(storage);
    const { signal, expected } = options;
    const { statements } = state;

    signal?.throwIfAborted();

    if (input.id === undefined) {
      const raw = { ...input, id: randomUUIDv7() };
      const params = columns(raw);

      write(state, raw.id, undefined, () => statements.insert.run(raw.id, ...params));

      return omitUndefined(raw);
    }

    if (!storable(input.id, 'id', StorageWriteError)) {
      throw missing(input.id);
    }

    const params = columns(input);

    write(state, input.id, expected, () =>
      expected === undefined
        ? statements.update.run(...params, input.id)
        : statements.updateIf.run(...params, input.id, expected)
    );

    return omitUndefined(input);
  }
};
