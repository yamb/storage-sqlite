export function prepare(db) {
  return {
    insert: db.prepare(`
      INSERT INTO posts (id, uri, slug, title, status, publishedAt, createdAt, updatedAt, tags_json, related_json, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    update: db.prepare(`
      UPDATE posts SET
        uri = ?, slug = ?, title = ?, status = ?, publishedAt = ?, createdAt = ?, updatedAt = ?,
        tags_json = ?, related_json = ?, raw_json = ?
      WHERE id = ?
    `),
    byId: db.prepare('SELECT raw_json FROM posts WHERE id = ?'),
    byUri: db.prepare('SELECT raw_json FROM posts WHERE uri = ?'),
    delete: db.prepare('DELETE FROM posts WHERE id = ?')
  };
}
