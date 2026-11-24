# yamb-storage-sqlite

[![npm version][npm-image]][npm-url] [![Build status][github-actions-image]][github-actions-url] [![Coverage status][coveralls-image]][coveralls-url] [![Dependency status][libraries-image]][libraries-url]

Store [Yamb](https://github.com/yamb/yamb) posts in an existing SQLite database through Node’s built-in `node:sqlite`.

For GitHub Packages, route the `@yamb` scope to `https://npm.pkg.github.com` and install `@yamb/storage-sqlite`.

## Quick start

Requires Node.js 26.13 or later, `yamb` and an existing SQLite file with the [required posts structure](#configuration-and-structure).

```bash
pnpm add yamb yamb-storage-sqlite
```

Set `YAMB_SQLITE_PATH` to the prepared database file.

```js
import { yamb } from 'yamb';
import { sqlite } from 'yamb-storage-sqlite';

await using blog = yamb({
  storage: sqlite({
    path: process.env.YAMB_SQLITE_PATH
  })
});

await blog.open();

const post = await blog.create({
  title: 'Hello',
  text: '**Hello**, SQLite.',
  status: 'published'
});

const saved = await blog.find(post.id);

console.log(saved.text);
```

## Reference

### Configuration and structure

`sqlite(config)` and `new SqliteStorage(config)` reject unknown configuration keys.

| Key        | Meaning                                  | Default  |
| ---------- | ---------------------------------------- | -------- |
| `path`     | Nonempty path to an existing SQLite file | Required |
| `readonly` | Open without write access                | `false`  |

`open()` requires the file to exist and prepares statements against its `posts` table. The application supplies the schema and any indexes.

| Column                      | Representation                                         |
| --------------------------- | ------------------------------------------------------ |
| `id`                        | Non-null text primary key                              |
| `uri`                       | Unique, non-null text                                  |
| `slug`, `title`, `status`   | Non-null text                                          |
| `publishedAt`               | Nullable text                                          |
| `createdAt`, `updatedAt`    | Non-null text                                          |
| `tags_json`, `related_json` | Non-null JSON text arrays                              |
| `raw_json`                  | Non-null JSON text containing the complete source post |

Flat columns support SQL filtering and ordering. `raw_json` is the returned source post, with dates as fixed-precision UTC strings and `undefined` properties omitted. Flat fields and lookup/query keys reject unpaired surrogates and preserve NUL. JSON-only strings and keys preserve both.

New IDs use `randomUUIDv7()`. Updates replace whole rows and fail if the target was deleted. Database constraints enforce URI uniqueness. Independent edits use whole-row last-write semantics.

Option comparisons use exact JSON scalar types. Missing fields match fixed defaults supplied by core on open. `find(id)` looks up a post by ID and `fetch(uri)` looks it up by current URI. Core refreshes its lookup maps from the `[id, uri]` pairs yielded by `entries()`.

### Ownership and cancellation

Each traversal owns a statement iterator and can observe concurrent writes. Early exit or cancellation releases that iterator. Finish or close traversals before closing storage.

`close()` releases the owned connection even after cancellation. Synchronous writes check cancellation before execution and preserve success once complete. Aborted operations preserve the native reason.

### Errors

| Code | Meaning |
| --- | --- |
| `YAMB_SQLITE_CONFIG` | Invalid configuration (`SqliteConfigError`) |
| `YAMB_SQLITE_OPEN` | Existing file cannot be opened (`SqliteOpenError`); cause retained |
| `YAMB_SQLITE_SCHEMA` | Statement preparation or open-context initialization failed (`SqliteSchemaError`); cause retained |
| `YAMB_STORAGE_READ` | Invalid native lookup key or corrupt `raw_json` |
| `YAMB_STORAGE_WRITE` | Invalid flat Unicode or SQLite write failure; native cause retained |
| `YAMB_STORAGE_DUPLICATE` | Unique constraint violation |
| `YAMB_POST_NOT_FOUND` | Missing update/removal target; missing reads return `null` |
| `YAMB_STORAGE_NOT_OPEN` | Operation outside an open lifetime |
| `YAMB_QUERY_VALIDATION` | Invalid query or pagination |

Shared errors come from `yamb/errors`. Adapter-specific classes are internal; inspect their stable codes. Native SQLite read/query failures can propagate directly.

## Author

[Alexey Simonenko](https://simonenko.xyz)

## License

MIT. See `LICENSE`.

[npm-image]: https://img.shields.io/npm/v/yamb-storage-sqlite?style=flat
[npm-url]: https://www.npmjs.com/package/yamb-storage-sqlite
[github-actions-image]: https://github.com/yamb/storage-sqlite/actions/workflows/ci.yml/badge.svg
[github-actions-url]: https://github.com/yamb/storage-sqlite/actions/workflows/ci.yml
[coveralls-image]: https://coveralls.io/repos/github/yamb/storage-sqlite/badge.svg
[coveralls-url]: https://coveralls.io/github/yamb/storage-sqlite
[libraries-image]: https://img.shields.io/librariesio/release/npm/yamb-storage-sqlite?style=flat
[libraries-url]: https://libraries.io/npm/yamb-storage-sqlite
