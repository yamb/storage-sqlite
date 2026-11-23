import { StorageNotOpenError } from '#core/errors';

import { buildCountQuery } from '../../query/build.js';
import { getState } from '../internal.js';

export default {
  name: 'count',

  async fn(storage, query = {}, options = {}) {
    options.signal?.throwIfAborted();
    const state = getState(storage);

    if (!state.db) {
      throw new StorageNotOpenError();
    }

    const { sql, bindings } = buildCountQuery(query, state.optionDefaults);
    const row = state.db.prepare(sql).get(...bindings);

    return Number(row.n);
  }
};
