# Plan

## Objective

Find the exact root cause of DB tests passing locally but failing in CI for PR 50, and validate only the minimal real fix.

## Checklist

- [x] Reproduce the historical failing CI merge commit locally
- [x] Identify the exact failing SQL/DB error
- [x] Compare local working tree vs remote PR merge tree
- [x] Validate the narrowest fix in an isolated worktree
- [x] Record only the verified root cause and fix
