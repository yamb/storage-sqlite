import assert from 'node:assert/strict';

import { yamb } from 'yamb';

import { sqlite, test } from './prepared-sqlite.js';

const CLOCK = () => Temporal.Instant.from('2026-04-26T12:00:00Z');

function makeBlog() {
  return yamb({
    storage: sqlite(),
    base: 'https://example.com',
    timeZone: 'UTC',
    clock: CLOCK
  });
}

async function withBlog(fn) {
  const blog = makeBlog();
  await blog.open();

  try {
    await fn(blog);
  } finally {
    await blog[Symbol.asyncDispose]();
  }
}

test('create draft, then publish, then fetch', async () => {
  await withBlog(async (blog) => {
    const post = blog.build({ title: 'Hello, world', text: '## Body' });
    await post.save();
    assert.equal(post.status, 'draft');

    await post.publish();
    assert.equal(post.status, 'published');

    const fetched = await blog.fetch(post.uri);
    assert.equal(fetched.title, 'Hello, world');
  });
});

test('blog.all() includes every status and blog.published selects public posts', async () => {
  await withBlog(async (blog) => {
    await blog.create({ title: 'A', text: '...', status: 'published' });
    await blog.create({ title: 'B', text: '...', status: 'draft' });
    await blog.create({ title: 'C', text: '...', status: 'published' });

    const posts = await blog.all().toArray();
    const titles = posts.map((p) => p.title);
    assert.equal(titles.length, 3);
    assert.equal(await blog.published.count(), 2);
    assert.ok(titles.includes('A'));
    assert.ok(titles.includes('C'));
  });
});

test('scope chain: blog.all({ tags }).published().recent()', async () => {
  await withBlog(async (blog) => {
    await blog.create({ title: 'JS', text: '...', status: 'published', tags: ['js'] });
    await blog.create({ title: 'Ruby', text: '...', status: 'published', tags: ['ruby'] });

    const posts = await blog
      .all({ tags: ['js'] })
      .published()
      .recent(5)
      .toArray();
    const titles = posts.map((p) => p.title);
    assert.deepEqual(titles, ['JS']);
  });
});

test('rename keeps incoming stable related ids', async () => {
  await withBlog(async (blog) => {
    const arch = await blog.create({ title: 'Architecture', text: '...', status: 'published' });

    const hello = blog.build({ title: 'Hello', text: '...', status: 'published' });
    hello.links = { related: [arch.id] };
    await hello.save();

    arch.slug = 'arch';
    await arch.save();

    const refetched = await blog.fetch('2026/04/hello');
    assert.deepEqual(refetched.links.related, [arch.id]);
  });
});

test('for await iterates blog like all()', async () => {
  await withBlog(async (blog) => {
    await blog.create({ title: 'X', text: '...', status: 'published' });
    const titles = [];

    for await (const p of blog) {
      titles.push(p.title);
    }

    assert.deepEqual(titles, ['X']);
  });
});

test('blog.fetch returns null for missing', async () => {
  await withBlog(async (blog) => {
    assert.equal(await blog.fetch('2026/04/missing'), null);
  });
});

test('removing a post clears its uri from reverse resolution', async () => {
  await withBlog(async (blog) => {
    const target = await blog.create({ title: 'Target', text: '...', status: 'published' });
    const targetUri = target.uri;

    await target.remove();

    assert.equal(blog.identify(targetUri), undefined);
    assert.equal(blog.locate(target.id), undefined);
    assert.equal(await blog.fetch(targetUri), null);
  });
});

test('two drafts with the same title get distinct, suffixed uris', async () => {
  await withBlog(async (blog) => {
    const first = blog.build({ title: 'Hello', text: '...' });
    await first.save();

    const second = blog.build({ title: 'Hello', text: '...' });
    await second.save();

    assert.equal(first.uri, 'drafts/hello');
    assert.match(second.uri, /^drafts\/hello-[0-9a-f]{6}$/);
    assert.notEqual(first.uri, second.uri);

    assert.ok(await blog.fetch(first.uri));
    assert.ok(await blog.fetch(second.uri));
  });
});
