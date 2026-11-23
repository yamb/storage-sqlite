#!/usr/bin/env bash
set -euo pipefail

output="${1:?Pass an output directory}"
mkdir -p "$output"
output="$(cd "$output" && pwd)"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

git ls-files -- LICENSE package.json ':(glob)src/**/*.js' > "$staging/files"
for file in LICENSE package.json src/index.js; do
  grep -Fxq "$file" "$staging/files"
done

mkdir "$staging/package"
cp pnpm-lock.yaml "$staging/package/"
while IFS= read -r file; do
  test -f "$file" && test ! -L "$file" || exit 1
  mkdir -p "$staging/package/$(dirname "$file")"
  cp "$file" "$staging/package/$file"
done < "$staging/files"

version="$(jq -er .version package.json)"
name="$(jq -er '.name | select(startswith("@meritt/yamb-")) | ltrimstr("@meritt/yamb-")' package.json)"
sed 's|^|package/|' "$staging/files" | LC_ALL=C sort > "$staging/expected"

pack() {
  local archive="$output/$1-$version.tgz"
  test ! -e "$archive"
  pnpm_config_ignore_scripts=true pnpm --dir "$staging/package" pack --out "$staging/result.tgz" --silent
  tar -tzf "$staging/result.tgz" | LC_ALL=C sort > "$staging/actual"
  diff -u "$staging/expected" "$staging/actual"
  mv "$staging/result.tgz" "$archive"
}

pack "meritt-yamb-$name"

jq --arg name "@yamb/$name" '
  def github: if . == "yamb" then "@yamb/core"
    else sub("^@meritt/yamb-"; "@yamb/") end;
  .name = $name |
  .publishConfig.registry = "https://npm.pkg.github.com/" |
  .devDependencies |= with_entries(.key |= github) |
  if .peerDependencies then
    .peerDependencies |= with_entries(.key |= github) |
    .imports["#core"] = "@yamb/core" | .imports["#core/*"] = "@yamb/core/*"
  else . end
' package.json > "$staging/package/package.json"
pack "yamb-$name"
