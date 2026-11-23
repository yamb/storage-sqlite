import { YambError } from '#core/errors';

export class SqliteConfigError extends YambError {
  static code = 'YAMB_SQLITE_CONFIG';
}
