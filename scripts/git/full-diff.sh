#!/usr/bin/env bash

git diff HEAD

git ls-files --others --exclude-standard -z |
while IFS= read -r -d '' file; do
  git diff --no-index -- /dev/null "$file" || true
done