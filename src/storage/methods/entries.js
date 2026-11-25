import { openState } from '../internal.js';

export default {
  name: 'entries',

  fn(storage, options = {}) {
    openState(storage);

    return {
      async *[Symbol.asyncIterator]() {
        options.signal?.throwIfAborted();
        using stmt = openState(storage).db.prepare('SELECT id, uri FROM posts');

        for (const row of stmt.iterate()) {
          options.signal?.throwIfAborted();
          yield [row.id, row.uri];
        }
      }
    };
  }
};
