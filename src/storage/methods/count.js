import { buildCountQuery } from '../../query/build.js';
import { openState } from '../internal.js';

export default {
  name: 'count',

  async fn(storage, query = {}, options = {}) {
    options.signal?.throwIfAborted();
    const state = openState(storage);
    const { sql, bindings } = buildCountQuery(query, state.optionDefaults);
    using stmt = state.db.prepare(sql);

    return stmt.get(...bindings).n;
  }
};
