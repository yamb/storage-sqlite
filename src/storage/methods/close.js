import { getState } from '../internal.js';

export default {
  name: 'close',

  async fn(storage) {
    const state = getState(storage);

    if (!state.db) {
      return;
    }

    state.db.close();
    state.db = null;
    state.statements = null;
    state.optionDefaults = {};
  }
};
