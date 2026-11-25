import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

import { SqliteOpenError, SqliteSchemaError } from '../../errors/index.js';
import { prepare } from '../../statements/index.js';
import { getState } from '../internal.js';

function location({ path, readonly }) {
  const url = pathToFileURL(path);

  // Without "c" in the mode SQLite never creates a missing file.
  url.searchParams.set('mode', readonly ? 'ro' : 'rw');

  return url;
}

export default {
  name: 'open',

  async fn(storage, context = {}) {
    context.signal?.throwIfAborted();
    const state = getState(storage);

    if (state.db) {
      return;
    }

    try {
      state.db = new DatabaseSync(location(state.config));
    } catch (cause) {
      throw new SqliteOpenError('failed to open existing sqlite database', { cause });
    }

    try {
      state.statements = prepare(state.db);
      state.optionDefaults = structuredClone(context.optionDefaults ?? {});
    } catch (cause) {
      state.db.close();
      state.db = null;
      state.statements = null;
      state.optionDefaults = {};

      throw new SqliteSchemaError('existing sqlite database requires the Yamb posts structure', {
        cause
      });
    }
  }
};
