import { StorageNotOpenError } from '#core/errors';

import { getState } from '../internal.js';
import { assertStringKey } from './assert-string-key.js';
import { parseRawJson } from './parse-raw.js';

export default {
  name: 'fetch',

  async fn(storage, uri, options = {}) {
    const state = getState(storage);

    if (!state.db) {
      throw new StorageNotOpenError();
    }

    assertStringKey(uri, 'uri');

    options.signal?.throwIfAborted();
    const row = state.statements.byUri.get(uri);

    if (!row) {
      return null;
    }

    return parseRawJson(row.raw_json, { uri });
  }
};
