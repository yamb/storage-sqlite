import { StorageReadError } from '#core/errors';

export function parseRawJson(json, details) {
  let raw;

  try {
    raw = JSON.parse(json);
  } catch (cause) {
    throw new StorageReadError('corrupt stored row: invalid JSON in raw_json', {
      cause,
      details
    });
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new StorageReadError('corrupt stored row: raw_json must contain an object', { details });
  }

  return raw;
}
