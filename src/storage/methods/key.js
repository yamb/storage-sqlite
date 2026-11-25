import { StorageReadError } from '#core/errors';

// Native text bindings replace unpaired surrogates, so such a key is never stored and would alias another row.
export function storable(value, field, ErrorClass = StorageReadError) {
  if (typeof value !== 'string') {
    throw new ErrorClass(`${field} must be a string`);
  }

  return value.isWellFormed();
}
