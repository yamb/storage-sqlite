import { StorageNotOpenError } from '#core/errors';

import { buildQuery } from '../../query/build.js';
import { getState } from '../internal.js';
import { parseRawJson } from './parse-raw.js';

export default {
  name: 'all',

  fn(storage, query = {}, options = {}) {
    options.signal?.throwIfAborted();
    const state = getState(storage);

    if (!state.db) {
      throw new StorageNotOpenError();
    }

    const { sql, bindings } = buildQuery(query, options, state.optionDefaults);

    return {
      async *[Symbol.asyncIterator]() {
        options.signal?.throwIfAborted();
        // Statement iterators share execution state; each traversal needs its own statement.
        const stmt = state.db.prepare(sql);

        for (const row of stmt.iterate(...bindings)) {
          options.signal?.throwIfAborted();
          yield parseRawJson(row.raw_json, { source: 'all' });
        }
      }
    };
  }
};
