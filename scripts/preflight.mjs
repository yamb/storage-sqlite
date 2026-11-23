import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { matchesGlob } from 'node:path';

import pkg from '../package.json' with { type: 'json' };

const repo = new URL(pkg.repository.url).pathname.slice(1).replace(/\.git$/, '');
const tag = `v${pkg.version}`;
const ref = `refs/tags/${tag}`;

function api(path, pages = false) {
  const args = ['api', `repos/${repo}/${path}`];

  if (pages) {
    args.push('--paginate', '--slurp');
  }

  const value = JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
  return pages ? value.flat() : value;
}

function matches(pattern) {
  return pattern === '~ALL' || matchesGlob(ref, pattern);
}

assert.ok(api('immutable-releases').enabled, 'Enable immutable releases in repository settings');

const rules = new Set();
for (const entry of api('rulesets?includes_parents=true&per_page=100', true)) {
  if (entry.enforcement !== 'active' || entry.target !== 'tag') {
    continue;
  }

  const rule = api(`rulesets/${entry.id}`);
  const names = rule.conditions?.ref_name;

  if (names && (!names.include.some(matches) || names.exclude.some(matches))) {
    continue;
  }

  for (const { type } of rule.rules) {
    rules.add(type);
  }
}
assert.ok(rules.has('update') && rules.has('deletion'), `Protect ${ref} from updates and deletion`);

const policy = api('environments/release').deployment_branch_policy;
assert.ok(policy?.custom_branch_policies, 'Configure release environment tag policies');
const policies = api('environments/release/deployment-branch-policies?per_page=100', true);
const allowed = policies.flatMap((page) => page.branch_policies);
assert.ok(
  allowed.some(({ type, name }) => type === 'tag' && matchesGlob(tag, name)),
  `Allow ${tag} in the release environment`
);

console.log(`${repo}: ${tag} release settings verified`);
