import { StorageNotOpenError, PostNotFoundError, StorageWriteError } from '#core/errors';

import { getState } from '../internal.js';
import { assertStringKey } from './assert-string-key.js';

export default {
  name: 'remove',

  async fn(storage, id, options = {}) {
    const state = getState(storage);

    if (!state.db) {
      throw new StorageNotOpenError();
    }

    options.signal?.throwIfAborted();
    assertStringKey(id, 'id', StorageWriteError);

    let result;

    try {
      result = state.statements.delete.run(id);
    } catch (cause) {
      throw new StorageWriteError(`sqlite write failed: ${cause.message}`, { cause });
    }

    if (result.changes === 0) {
      throw new PostNotFoundError(`id "${id}" not found (race?)`);
    }
  }
};
