import { orderValues } from '#core/constants';
import { QueryValidationError } from '#core/errors';
import {
  encodeInstant,
  LimitSchema,
  OffsetSchema,
  OptionFilterSchema,
  TagSchema
} from '#core/schemas';

function bound(value, field) {
  if (value instanceof Temporal.Instant) {
    return encodeInstant(value);
  }

  if (value instanceof Date) {
    return encodeInstant(Temporal.Instant.fromEpochMilliseconds(value.getTime()));
  }

  if (typeof value === 'string' && !value.isWellFormed()) {
    throw new QueryValidationError(`query.${field} must be well-formed Unicode`, {
      details: { field }
    });
  }

  return value;
}

function rejectOperators(field, value) {
  if (
    value !== null &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    !(value instanceof Temporal.Instant)
  ) {
    throw new QueryValidationError(
      `query.${field} must be a primitive (string/number); got an object — operator injection rejected`,
      { details: { field, type: typeof value } }
    );
  }
}

function isDescending(order = '-publishedAt') {
  if (!orderValues.includes(order)) {
    throw new QueryValidationError(`invalid order "${order}"`, {
      details: { field: 'order', allowed: orderValues }
    });
  }

  return order.startsWith('-');
}

function buildOrder(order, descending) {
  const field = descending ? order.slice(1) : order;
  const direction = descending ? 'DESC' : 'ASC';

  return `ORDER BY ${field} ${direction}, uri ${direction}`;
}

function rejectEmptyString(field, value) {
  if (value === '') {
    throw new QueryValidationError(`query.${field} must not be an empty string`, {
      details: { field }
    });
  }
}

function buildWhere(query, descending, defaults) {
  const where = [];
  const bindings = [];

  if (query.options !== undefined) {
    const result = OptionFilterSchema.safeParse(query.options);

    if (!result.success) {
      throw new QueryValidationError(
        'options filter requires supported names and scalar JSON values'
      );
    }

    for (const [key, value] of Object.entries(result.data)) {
      const path = `$.options.${key}`;
      let predicate;

      if (value === null || typeof value === 'boolean') {
        predicate = 'json_type(raw_json, ?) = ?';
        bindings.push(path, value === null ? 'null' : String(value));
      } else {
        const types = typeof value === 'string' ? "('text')" : "('integer', 'real')";

        predicate = `json_type(raw_json, ?) IN ${types} AND json_extract(raw_json, ?) = json_extract(?, '$')`;
        bindings.push(path, path, JSON.stringify(value));
      }

      if (Object.hasOwn(defaults, key) && defaults[key] === value) {
        predicate = `(${predicate}) OR json_type(raw_json, ?) IS NULL`;
        bindings.push(path);
      }

      where.push(`(${predicate})`);
    }
  }

  rejectEmptyString('status', query.status);
  rejectEmptyString('tag', query.tag);
  rejectEmptyString('uri', query.uri);

  if (query.status) {
    rejectOperators('status', query.status);
    where.push('status = ?');
    bindings.push(bound(query.status, 'status'));
  }

  if (query.tag) {
    rejectOperators('tag', query.tag);
    where.push("EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value = json_extract(?, '$'))");
    bindings.push(JSON.stringify(query.tag));
  }

  if (query.tags !== undefined) {
    if (!Array.isArray(query.tags)) {
      throw new QueryValidationError('query.tags must be an array of tags');
    }

    for (const tag of query.tags) {
      if (!TagSchema.safeParse(tag).success) {
        throw new QueryValidationError('query.tags must contain valid tags');
      }
    }

    where.push(`NOT EXISTS (
      SELECT 1 FROM json_each(?) AS required
      WHERE NOT EXISTS (
        SELECT 1 FROM json_each(tags_json) AS stored
        WHERE stored.value = required.value AND stored.type = required.type
      )
    )`);
    bindings.push(JSON.stringify(query.tags));
  }

  if (query.before) {
    rejectOperators('before', query.before);
    where.push('publishedAt < ?');
    bindings.push(bound(query.before, 'before'));
  }

  if (query.after) {
    rejectOperators('after', query.after);
    where.push('publishedAt > ?');
    bindings.push(bound(query.after, 'after'));
  }

  if (query.uri) {
    rejectOperators('uri', query.uri);
    where.push('uri = ?');
    bindings.push(bound(query.uri, 'uri'));
  }

  if (query.cursor) {
    if (
      typeof query.cursor !== 'object' ||
      Array.isArray(query.cursor) ||
      query.cursor.publishedAt == null ||
      query.cursor.uri == null
    ) {
      throw new QueryValidationError('query.cursor must be an object with publishedAt and uri', {
        details: { field: 'cursor' }
      });
    }

    const { publishedAt, uri } = query.cursor;
    rejectOperators('cursor.publishedAt', publishedAt);
    rejectOperators('cursor.uri', uri);

    const operator = descending ? '<' : '>';

    where.push(`(publishedAt, uri) ${operator} (?, ?)`);
    bindings.push(bound(publishedAt, 'cursor.publishedAt'), bound(uri, 'cursor.uri'));
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    bindings
  };
}

function validatePage(options) {
  if (options.limit !== undefined) {
    const result = LimitSchema.safeParse(options.limit);

    if (!result.success) {
      throw new QueryValidationError(`options.limit must be a non-negative integer or null`, {
        details: { field: 'limit', issues: result.error.issues }
      });
    }
  }

  if (options.offset !== undefined) {
    const result = OffsetSchema.safeParse(options.offset);

    if (!result.success) {
      throw new QueryValidationError(`options.offset must be a non-negative integer`, {
        details: { field: 'offset', issues: result.error.issues }
      });
    }
  }
}

function buildPage(options) {
  validatePage(options);

  const hasOffset = options.offset != null && options.offset > 0;

  if (options.limit == null && !hasOffset) {
    return '';
  }

  const limit = options.limit != null ? Number(options.limit) : -1;
  const limitSql = `LIMIT ${limit}`;

  return hasOffset ? `${limitSql} OFFSET ${Number(options.offset)}` : limitSql;
}

export function buildQuery(query, options, defaults = {}) {
  const order = options.order ?? '-publishedAt';
  const descending = isDescending(order);
  const { whereSql, bindings } = buildWhere(query, descending, defaults);
  const orderSql = buildOrder(order, descending);
  const pageSql = buildPage(options);

  return {
    sql: `SELECT raw_json FROM posts ${whereSql} ${orderSql} ${pageSql}`.trim(),
    bindings
  };
}

export function buildCountQuery(query, defaults = {}) {
  const { whereSql, bindings } = buildWhere(query, true, defaults);

  return {
    sql: `SELECT COUNT(*) AS n FROM posts ${whereSql}`.trim(),
    bindings
  };
}
