import { openState } from '../internal.js';
import { storable } from './key.js';
import { parseRawJson } from './parse-raw.js';

export default {
  name: 'fetch',

  async fn(storage, uri, options = {}) {
    const state = openState(storage);

    if (!storable(uri, 'uri')) {
      return null;
    }

    options.signal?.throwIfAborted();
    const row = state.statements.byUri.get(uri);

    return row ? parseRawJson(row.raw_json, { uri }) : null;
  }
};
