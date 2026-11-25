import {
  PostConflictError,
  PostNotFoundError,
  StorageDuplicateError,
  StorageWriteError
} from '#core/errors';

const SQLITE_CONSTRAINT_UNIQUE = 2067;

export function missing(id) {
  return new PostNotFoundError(`id "${id}" not found`);
}

export function write(state, id, expected, run) {
  let found;

  try {
    if (run().changes > 0) {
      return;
    }

    found = expected !== undefined && state.statements.byId.get(id) !== undefined;
  } catch (cause) {
    if (cause.errcode === SQLITE_CONSTRAINT_UNIQUE) {
      throw new StorageDuplicateError('uri already exists', { cause });
    }

    throw new StorageWriteError(`sqlite write failed: ${cause.message}`, { cause });
  }

  if (found) {
    throw new PostConflictError(`id "${id}" has another version`, { details: { id, expected } });
  }

  throw missing(id);
}
