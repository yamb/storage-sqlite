import { buildQuery } from '../../query/build.js';
import { openState } from '../internal.js';
import { parseRawJson } from './parse-raw.js';

export default {
  name: 'all',

  fn(storage, query = {}, options = {}) {
    options.signal?.throwIfAborted();
    const { sql, bindings } = buildQuery(query, options, openState(storage).optionDefaults);

    return {
      async *[Symbol.asyncIterator]() {
        options.signal?.throwIfAborted();
        // Statement iterators share execution state; each traversal needs its own statement.
        using stmt = openState(storage).db.prepare(sql);

        for (const row of stmt.iterate(...bindings)) {
          options.signal?.throwIfAborted();
          yield parseRawJson(row.raw_json, { source: 'all' });
        }
      }
    };
  }
};
