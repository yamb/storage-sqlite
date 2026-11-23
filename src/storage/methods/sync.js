import { StorageNotOpenError } from '#core/errors';

import { getState } from '../internal.js';

export default {
  name: 'sync',

  async fn(storage, options = {}) {
    if (!getState(storage).db) {
      throw new StorageNotOpenError();
    }

    options.signal?.throwIfAborted();
  }
};
