import { StorageWriteError } from '#core/errors';

import { openState } from '../internal.js';
import { storable } from './key.js';
import { missing, write } from './write.js';

export default {
  name: 'fence',

  async fn(storage, id, version, options = {}) {
    const state = openState(storage);
    const { signal, expected } = options;

    signal?.throwIfAborted();

    if (!storable(version, 'version', StorageWriteError)) {
      throw new StorageWriteError('version must be well-formed Unicode');
    }

    if (!storable(id, 'id', StorageWriteError)) {
      throw missing(id);
    }

    write(state, id, expected, () =>
      expected === undefined
        ? state.statements.fence.run(version, id)
        : state.statements.fenceIf.run(version, id, expected)
    );
  }
};
