import { openState } from '../internal.js';
import { storable } from './key.js';
import { parseRawJson } from './parse-raw.js';

export default {
  name: 'find',

  async fn(storage, id, options = {}) {
    const state = openState(storage);

    if (!storable(id, 'id')) {
      return null;
    }

    options.signal?.throwIfAborted();
    const row = state.statements.byId.get(id);

    return row ? parseRawJson(row.raw_json, { id }) : null;
  }
};
