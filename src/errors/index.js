import { YambError } from '#core/errors';

export class SqliteConfigError extends YambError {
  static code = 'YAMB_SQLITE_CONFIG';
}

export class SqliteOpenError extends YambError {
  static code = 'YAMB_SQLITE_OPEN';
}

export class SqliteSchemaError extends YambError {
  static code = 'YAMB_SQLITE_SCHEMA';
}
