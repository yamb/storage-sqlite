import { YambError } from '#core/errors';

export class SqliteSchemaError extends YambError {
  static code = 'YAMB_SQLITE_SCHEMA';
}
