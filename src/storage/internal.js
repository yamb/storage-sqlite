import { StorageNotOpenError } from '#core/errors';
import { store } from '#core/internal';

export const { get: getState, set: setState } = store('SqliteStorage');

export function openState(storage) {
  const state = getState(storage);

  if (!state.db) {
    throw new StorageNotOpenError();
  }

  return state;
}
