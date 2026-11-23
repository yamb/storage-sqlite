import assert from 'node:assert/strict';
import test from 'node:test';

test(
  'SQLite round trip retains live references across save and resolves related ids',
  {
    skip: process.env.YAMB_SQLITE_FIXTURE
      ? false
      : 'Provide an existing schema through YAMB_SQLITE_FIXTURE; this test never creates one'
  },
  async () => {
    const { sqlite } = await import('@meritt/yamb-storage-sqlite');
    const { yamb } = await import('yamb');
    const path = process.env.YAMB_SQLITE_FIXTURE;
    const { access } = await import('node:fs/promises');
    await access(path);

    const storage = sqlite({ path });
    const blog = yamb({ storage, timeZone: 'UTC' });
    const created = [];
    await blog.open();

    try {
      const suffix = crypto.randomUUID();
      const target = await blog.create({
        title: 'Related',
        slug: `related-${suffix}`,
        status: 'published'
      });
      created.push(target);
      const draft = await blog.create({ title: 'Draft related', slug: `draft-related-${suffix}` });
      created.push(draft);
      const post = await blog.create({
        title: 'Editor',
        slug: `editor-${suffix}`,
        tags: ['js'],
        meta: { keywords: ['node'] },
        links: { related: [target.id, draft.id] },
        preview: 'Temporary'
      });
      created.push(post);

      const { tags } = post;
      const { keywords } = post.meta;
      const { related } = post.links;

      post.tags.push('edited');
      post.preview = undefined;
      await post.save();
      assert.equal(post.tags, tags);
      assert.equal(post.meta.keywords, keywords);
      assert.equal(post.links.related, related);
      assert.deepEqual(post.changes(), {});

      tags.push('after-save');
      keywords.push('after-save');
      assert.deepEqual(post.changes().tags, ['js', 'edited', 'after-save']);
      await post.save();
      const loaded = await blog.find(post.id);
      assert.deepEqual(loaded.tags, ['js', 'edited', 'after-save']);
      assert.deepEqual(loaded.meta.keywords, ['node', 'after-save']);
      assert.ok(!Object.hasOwn(loaded.toJSON(), 'preview'));

      target.slug = `renamed-${suffix}`;
      await target.save();
      assert.deepEqual(loaded.links.related, [target.id, draft.id]);
      const resolved = await Array.fromAsync(loaded.related());
      assert.deepEqual(
        resolved.map((item) => item.id),
        [target.id]
      );
      assert.equal(resolved[0].uri, target.uri);

      await draft.remove();
      created.splice(created.indexOf(draft), 1);
      const withMissing = await blog.find(post.id);
      assert.deepEqual(withMissing.links.related, [target.id, draft.id]);
      const remaining = await Array.fromAsync(withMissing.related());
      assert.deepEqual(
        remaining.map((item) => item.id),
        [target.id]
      );
    } finally {
      try {
        for (const post of created.toReversed()) {
          await post.remove();
        }
      } finally {
        await blog.close();
      }
    }
  }
);
