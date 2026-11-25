import { z } from 'zod';

import { QueryValidationError } from '#core/errors';
import { encodeInstant, InstantSchema, OptionsSchema, QuerySchema, UriSchema } from '#core/schemas';

const FilterSchema = QuerySchema.extend({
  cursor: z.strictObject({ publishedAt: InstantSchema, uri: UriSchema }).optional()
});

function parse(schema, value, field) {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new QueryValidationError(`invalid ${field}: ${z.prettifyError(result.error)}`, {
      details: { field, issues: result.error.issues }
    });
  }

  return result.data;
}

function optionPredicate(key, value, defaults, bindings) {
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

  return `(${predicate})`;
}

function buildWhere(input, descending, defaults) {
  const query = parse(FilterSchema, input, 'query');
  const where = [];
  const bindings = [];

  for (const [key, value] of Object.entries(query.options ?? {})) {
    where.push(optionPredicate(key, value, defaults, bindings));
  }

  if (query.status !== undefined) {
    where.push('status = ?');
    bindings.push(query.status);
  }

  if (query.tags !== undefined) {
    where.push(`NOT EXISTS (
      SELECT 1 FROM json_each(?) AS required
      WHERE NOT EXISTS (
        SELECT 1 FROM json_each(tags_json) AS stored
        WHERE stored.value = required.value AND stored.type = required.type
      )
    )`);
    bindings.push(JSON.stringify(query.tags));
  }

  if (query.before !== undefined) {
    where.push('publishedAt < ?');
    bindings.push(encodeInstant(query.before));
  }

  if (query.after !== undefined) {
    where.push('publishedAt > ?');
    bindings.push(encodeInstant(query.after));
  }

  if (query.uri !== undefined) {
    where.push('uri = ?');
    bindings.push(query.uri);
  }

  if (query.cursor !== undefined) {
    where.push(`(publishedAt, uri) ${descending ? '<' : '>'} (?, ?)`);
    bindings.push(encodeInstant(query.cursor.publishedAt), query.cursor.uri);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    bindings
  };
}

export function buildQuery(query, options, defaults = {}) {
  const { order = '-publishedAt', limit, offset } = parse(OptionsSchema, options, 'options');
  const descending = order.startsWith('-');
  const field = descending ? order.slice(1) : order;
  const direction = descending ? 'DESC' : 'ASC';
  const { whereSql, bindings } = buildWhere(query, descending, defaults);
  let pageSql = '';

  if (limit != null || offset) {
    pageSql = 'LIMIT ? OFFSET ?';
    bindings.push(limit ?? -1, offset ?? 0);
  }

  return {
    sql: `SELECT raw_json FROM posts ${whereSql} ORDER BY ${field} ${direction}, uri ${direction} ${pageSql}`.trim(),
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
