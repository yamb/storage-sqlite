import { SqliteStorage } from './storage/index.js';

export function sqlite(config) {
  return new SqliteStorage(config);
}

export { SqliteStorage };
