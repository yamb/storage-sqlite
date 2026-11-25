import { StorageWriteError } from '#core/errors';

import { openState } from '../internal.js';
import { storable } from './key.js';
import { missing, write } from './write.js';

export default {
  name: 'remove',

  async fn(storage, id, options = {}) {
    const state = openState(storage);
    const { signal, expected } = options;

    signal?.throwIfAborted();

    if (!storable(id, 'id', StorageWriteError)) {
      throw missing(id);
    }

    write(state, id, expected, () =>
      expected === undefined
        ? state.statements.delete.run(id)
        : state.statements.deleteIf.run(id, expected)
    );
  }
};
