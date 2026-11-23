import { store } from '#core/internal';

export const { get: getState, set: setState } = store('SqliteStorage');
