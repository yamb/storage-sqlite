import { StorageReadError } from '#core/errors';

export function assertStringKey(value, field, ErrorClass = StorageReadError) {
  if (typeof value !== 'string') {
    throw new ErrorClass(`${field} must be a string`);
  }

  if (!value.isWellFormed()) {
    throw new ErrorClass(`${field} must be well-formed Unicode`);
  }
}
