import { StorageNotOpenError, StorageWriteError } from '#core/errors';

import { getState } from '../internal.js';
import { assertStringKey } from './assert-string-key.js';
import { mismatch } from './mismatch.js';

export default {
  name: 'fence',

  async fn(storage, id, version, options = {}) {
    const state = getState(storage);

    if (!state.db) {
      throw new StorageNotOpenError();
    }

    const { signal, expected } = options;

    signal?.throwIfAborted();
    assertStringKey(id, 'id', StorageWriteError);
    assertStringKey(version, 'version', StorageWriteError);

    try {
      const result =
        expected === undefined
          ? state.statements.fence.run(version, id)
          : state.statements.fenceIf.run(version, id, expected);

      if (result.changes === 0) {
        throw mismatch(state, id, expected);
      }
    } catch (cause) {
      if (cause.code?.startsWith('YAMB_')) {
        throw cause;
      }

      throw new StorageWriteError(`sqlite write failed: ${cause.message}`, { cause });
    }
  }
};
