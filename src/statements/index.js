const columns = `
  uri = ?, slug = ?, title = ?, status = ?, publishedAt = ?, createdAt = ?, updatedAt = ?,
  tags_json = ?, related_json = ?, raw_json = ?
`;
const version = `json_extract(raw_json, '$.version') IS ?`;
const stamp = `raw_json = json_set(raw_json, '$.version', ?)`;

export function prepare(db) {
  return {
    insert: db.prepare(`
      INSERT INTO posts (id, uri, slug, title, status, publishedAt, createdAt, updatedAt, tags_json, related_json, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    update: db.prepare(`UPDATE posts SET ${columns} WHERE id = ?`),
    updateIf: db.prepare(`UPDATE posts SET ${columns} WHERE id = ? AND ${version}`),
    fence: db.prepare(`UPDATE posts SET ${stamp} WHERE id = ?`),
    fenceIf: db.prepare(`UPDATE posts SET ${stamp} WHERE id = ? AND ${version}`),
    byId: db.prepare('SELECT raw_json FROM posts WHERE id = ?'),
    byUri: db.prepare('SELECT raw_json FROM posts WHERE uri = ?'),
    delete: db.prepare('DELETE FROM posts WHERE id = ?'),
    deleteIf: db.prepare(`DELETE FROM posts WHERE id = ? AND ${version}`)
  };
}
