import assert from 'node:assert/strict';

import { yamb } from 'yamb';

import { sqlite, test } from './prepared-sqlite.js';

test('cover nested edits, reset and reopen preserve source objects', async () => {
  const storage = sqlite();
  const blog = yamb({ storage });

  try {
    await blog.open();
    const source = {
      url: './cover.jpg',
      alt: ' Alt ',
      caption: ' Caption ',
      width: 640,
      height: 480
    };
    const post = await blog.create({ title: 'Cover', cover: source });
    source.caption = 'Outside';
    assert.equal(post.cover.caption, ' Caption ');

    const snapshot = await storage.find(post.id);
    assert.deepEqual(snapshot.cover, {
      url: './cover.jpg',
      alt: ' Alt ',
      caption: ' Caption ',
      width: 640,
      height: 480
    });

    snapshot.cover.caption = 'Snapshot';
    const stored = await storage.find(post.id);
    assert.equal(stored.cover.caption, ' Caption ');

    post.cover.caption = 'Edited';
    delete post.cover.width;
    await post.save();
    const expected = post.toJSON().cover;

    await blog.close();
    await blog.open();
    const loaded = await blog.find(post.id);
    assert.deepEqual(loaded.cover, expected);

    loaded.cover.url = undefined;
    await loaded.save();
    const partial = await storage.fetch(loaded.uri);
    assert.deepEqual(partial.cover, {
      alt: ' Alt ',
      caption: 'Edited',
      height: 480
    });

    loaded.cover = undefined;
    await loaded.save();
    await blog.close();
    await blog.open();
    const cleared = await blog.find(post.id);
    assert.deepEqual(cleared.cover, {});
  } finally {
    await blog.close();
  }
});
