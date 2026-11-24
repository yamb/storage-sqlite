import { PostConflictError, PostNotFoundError } from '#core/errors';

export function mismatch(state, id, expected) {
  if (expected !== undefined && state.statements.byId.get(id)) {
    return new PostConflictError(`id "${id}" has another version`, { details: { id, expected } });
  }

  return new PostNotFoundError(`id "${id}" not found`);
}
