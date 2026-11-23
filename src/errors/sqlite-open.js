import { YambError } from '#core/errors';

export class SqliteOpenError extends YambError {
  static code = 'YAMB_SQLITE_OPEN';
}
