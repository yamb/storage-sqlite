import { openState } from '../internal.js';

export default {
  name: 'sync',

  async fn(storage, options = {}) {
    openState(storage);
    options.signal?.throwIfAborted();
  }
};
