import { accessSync, constants } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { SqliteOpenError, SqliteSchemaError } from '../../errors/index.js';
import { prepare } from '../../statements/index.js';
import { getState } from '../internal.js';

export default {
  name: 'open',

  async fn(storage, context = {}) {
    context.signal?.throwIfAborted();
    const state = getState(storage);

    if (state.db) {
      return;
    }

    try {
      accessSync(state.config.path, constants.F_OK);
      state.db = new DatabaseSync(state.config.path, {
        readOnly: state.config.readonly
      });
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
