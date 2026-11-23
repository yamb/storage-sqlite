import { StorageNotOpenError } from '#core/errors';

import { getState } from '../internal.js';

export default {
  name: 'entries',

  fn(storage, options = {}) {
    const state = getState(storage);

    if (!state.db) {
      throw new StorageNotOpenError();
    }

    return {
      async *[Symbol.asyncIterator]() {
        options.signal?.throwIfAborted();
        using stmt = state.db.prepare('SELECT id, uri FROM posts');

        for (const row of stmt.iterate()) {
          options.signal?.throwIfAborted();
          yield [row.id, row.uri];
        }
      }
    };
  }
};
