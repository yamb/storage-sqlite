#!/usr/bin/env bash
set -euo pipefail

directory="$(mktemp -d)"
trap 'rm -rf "$directory"' EXIT
tar -xzf "${1:?Pass the tarball path}" -C "$directory"
package="$directory/package"

cp scripts/smoke.mjs "$package/smoke.mjs"

node --input-type=module - "$package" <<'JS'
import { mkdir, readFile, realpath, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
const pkg = JSON.parse(await readFile(join(root, 'package.json')));
const dependencies = { ...pkg.dependencies, ...pkg.peerDependencies };

for (const name of Object.keys(dependencies)) {
  const source = name === '@yamb/core' ? 'yamb' : name;
  const installed = await realpath(join('node_modules', source));
  const target = join(root, 'node_modules', name);
  await mkdir(dirname(target), { recursive: true });
  await symlink(installed, target, 'dir');
}

await import(pathToFileURL(join(root, 'smoke.mjs')));
JS
