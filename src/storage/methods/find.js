import { StorageNotOpenError } from '#core/errors';

import { getState } from '../internal.js';
import { assertStringKey } from './assert-string-key.js';
import { parseRawJson } from './parse-raw.js';

export default {
  name: 'find',

  async fn(storage, id, options = {}) {
    const state = getState(storage);

    if (!state.db) {
      throw new StorageNotOpenError();
    }

    assertStringKey(id, 'id');

    options.signal?.throwIfAborted();
    const row = state.statements.byId.get(id);

    if (!row) {
      return null;
    }

    return parseRawJson(row.raw_json, { id });
  }
};
