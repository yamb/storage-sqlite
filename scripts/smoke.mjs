import assert from 'node:assert/strict';

import { yamb } from '#core';

import pkg from './package.json' with { type: 'json' };

const { sqlite } = await import(pkg.name);

const storage = sqlite({ path: process.env.YAMB_SQLITE_FIXTURE });
await using blog = yamb({ storage });
await blog.open();
assert.equal(await blog.all().count(), 0, 'Expected an empty storage fixture');

const post = await blog.create({ title: 'Packaged storage', text: '**source**' });

try {
  const saved = await storage.find(post.id);
  assert.equal(saved.text, '**source**');
} finally {
  await post.remove();
}
