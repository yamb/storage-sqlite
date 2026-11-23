import { z } from 'zod';

import { SqliteConfigError } from '../errors/index.js';
import { ConfigSchema } from '../schemas/zod.js';
import { setState } from './internal.js';
import methods from './methods.js';

export class SqliteStorage {
  constructor(config) {
    const result = ConfigSchema.safeParse(config);

    if (!result.success) {
      throw new SqliteConfigError(`invalid config: ${z.prettifyError(result.error)}`, {
        details: { issues: result.error.issues }
      });
    }

    setState(this, {
      config: result.data,
      db: null,
      statements: null,
      optionDefaults: {}
    });
  }

  static {
    for (const method of methods) {
      Object.defineProperty(this.prototype, method.name, {
        value(...args) {
          return method.fn(this, ...args);
        },
        writable: false,
        configurable: false,
        enumerable: false
      });
    }
  }
}
