# Parent Branch Tracking System

### Full Architecture, Installation, and WSL Integration Guide

### Version 1.0 — Senior Architect Edition

A deterministic, rebase-safe, and shared branch lineage tracking system with VS Code integration and CI enforcement.

---

# 1. Overview

The **Parent Branch Status System** provides a deterministic, reproducible way to track and display parent‑branch metadata across Git workflows. It consists of two cooperating components:

1. **A Git extension** (`git-branch-origin`)
   - Stores parent branch metadata
   - Retrieves parent metadata
   - Computes parent chains
   - Works across rebases, merges, and team workflows

2. **A VS Code extension**
   - Displays the parent branch in the status bar
   - Runs inside **WSL Remote Extension Host**  
     mkdir -p .git/branch-origins

   - Uses the Git extension to resolve metadata

- Git metadata storage (Local + Git Notes)
- WSL‑aware installation
- VSIX packaging
  for file in .git/branch-origins/\*; do
  [ -f "$file" ] || continue
  safe_branch=$(basename "$file")
  branch=$(printf '%s' "$safe_branch" | sed 's/\_\_/\//g')

      if ! git show-ref --verify --quiet "refs/heads/$branch"; then
        rm -f "$file"
      fi

  done
  }

prune_orphan_entries

if [ -f "$ORIGIN_FILE" ]; then
exit 0
fi

RELOG_MSG=$(git reflog show -n 1 --format=%gs "refs/heads/$CURRENT_BRANCH" 2>/dev/null || echo "")
case "$RELOG_MSG" in
  "branch: Created from "*|"branch: Created"*)
    git branch-origin init "$CURRENT_BRANCH" "$PREVIOUS_BRANCH"
;;
\*)
exit 0
;;
esac

---

# 3. Git Extension: `git-branch-origin`

## 3.1 Purpose

The Git extension provides a stable metadata model that survives rebases by using both local filesystem storage and Git Notes.

## 3.2 Command Structure

Git automatically exposes executables named `git-<name>` as `git <name>`.
Thus, `git-branch-origin` becomes:

```bash
$ git branch-origin
```

## 3.3 Supported Commands

```bash
git branch-origin show <branch>
git branch-origin set <branch> <parent>
git branch-origin init <branch> <parent>
git branch-origin init-missing <parent>
git branch-origin chain <branch>
```

## 3.4 Metadata Storage

- **Local**: Metadata is stored in `.git/branch-origins/<branch>`.
- **Git Notes**: Stored in `refs/notes/branch-origins/<branch>` on the branch's first commit.

---

# 4. Installation & Setup

## 4.1 Global Installation (WSL)

Place the script in your global PATH to make it accessible to Git:

```bash
sudo cp bin/git-branch-origin /usr/local/bin/
sudo chmod +x /usr/local/bin/git-branch-origin
```

## 4.2 Git Configuration

Add the `new-branch` alias to ensure metadata is recorded immediately:

```ini
[alias]
  new-branch = "!f() { \
    if [ $# -ne 1 ]; then echo 'Usage: git new-branch <name>' >&2; exit 1; fi; \
    parent=$(git rev-parse --abbrev-ref HEAD); \
    name=\"$1\"; \
    git checkout -b \"$name\"; \
    git branch-origin init \"$name\" \"$parent\"; \
  }; f"
```

Enable Git Notes sharing:

```bash
git config --add remote.origin.fetch refs/notes/branch-origins/*:refs/notes/branch-origins/*
```

## 4.3 Bash Completion (Optional)

Enable TAB completion for `git branch-origin` commands and branch names:

```bash
cat <<'EOF' >> ~/.bash_completion
if ! type __git_complete >/dev/null 2>&1; then
  if [ -f /usr/share/bash-completion/completions/git ]; then
    . /usr/share/bash-completion/completions/git
  fi
fi

_git_branch_origin() {
  case "$cur" in
    -* )
      return
      ;;
  esac

  case "$prev" in
    show|set|init|chain|init-missing)
      __git_complete_refs
      ;;
  esac

  __gitcomp "show set init init-missing chain"
}

complete -r git-branch-origin 2>/dev/null || true
__git_complete git-branch-origin _git_branch_origin
EOF

if [ -f ~/.bash_completion ]; then
  . ~/.bash_completion
fi
```

Open a new terminal or run:

```bash
source ~/.bashrc
```

## 4.3 Initialize Missing Metadata (Optional)

If you already have branches without parent metadata, seed them from a known base:

```bash
git branch-origin init-missing main
```

---

# 5. Git Hooks (Husky)

### 5.1 `.husky/post-checkout`

Automatically records parent branch on creation:

```bash
#!/bin/sh
set -eu

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ -z "$CURRENT_BRANCH" ] || [ "$CURRENT_BRANCH" = "HEAD" ]; then
  exit 0
fi

PREVIOUS_BRANCH=$(git rev-parse --abbrev-ref @{-1} 2>/dev/null || echo "")
if [ -z "$PREVIOUS_BRANCH" ] || [ "$PREVIOUS_BRANCH" = "$CURRENT_BRANCH" ]; then
  exit 0
fi

mkdir -p .git/branch-origins

prune_orphan_entries() {
  [ -d .git/branch-origins ] || return 0

  for file in .git/branch-origins/*; do
    [ -f "$file" ] || continue
    safe_branch=$(basename "$file")
    branch=$(printf '%s' "$safe_branch" | sed 's/__/\//g')

    if ! git show-ref --verify --quiet "refs/heads/$branch"; then
      rm -f "$file"
    fi
  done
}

prune_orphan_entries

SAFE_BRANCH=$(echo "$CURRENT_BRANCH" | sed 's/\//__/g')
ORIGIN_FILE=".git/branch-origins/$SAFE_BRANCH"

if [ -f "$ORIGIN_FILE" ]; then
  exit 0
fi

RELOG_MSG=$(git reflog show -n 1 --format=%gs "refs/heads/$CURRENT_BRANCH" 2>/dev/null || echo "")
case "$RELOG_MSG" in
  "branch: Created from "*|"branch: Created"*)
    git branch-origin init "$CURRENT_BRANCH" "$PREVIOUS_BRANCH"
    ;;
  *)
    exit 0
    ;;
esac
```

### 5.2 `.husky/pre-push`

Ensures metadata is shared:

```bash
#!/bin/sh

# Push parent-branch notes
git push origin 'refs/notes/branch-origins/*:refs/notes/branch-origins/*' || echo "Warning: Could not push notes"
```

---

# 6. VS Code Extension (WSL Remote)

The extension displays the parent branch in the status bar and runs inside the WSL Remote Extension Host.

### package.json

```json
{
  "name": "parent-branch-status",
  "displayName": "Parent Branch Status",
  "version": "1.2.0",
  "publisher": "local",
  "engines": {
    "vscode": "^1.50.0"
  },
  "main": "./parent-branch-status.js",
  "activationEvents": ["*"],
  "contributes": {}
}
```

### parent-branch-status.js

```js
const cp = require('child_process');
const vscode = require('vscode');

/**
 * Executes a shell command asynchronously
 */
function runAsync(cmd) {
  return new Promise((resolve) => {
    cp.exec(cmd, { encoding: 'utf8' }, (error, stdout) => {
      if (error) {
        resolve('');
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function activate(context) {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  item.tooltip = 'Parent branch metadata';
  item.show();

  let timeout = null;

  async function update() {
    const branch = await runAsync('git rev-parse --abbrev-ref HEAD');
    if (!branch || branch === 'HEAD') {
      item.text = '$(git-branch) Parent: <detached>';
      return;
    }

    // Single async call for all metadata
    const output = await runAsync(`git branch-origin show ${branch}`);
    if (!output) {
      item.text = `$(git-branch) Parent: <none>`;
      return;
    }

    const lines = output.split('\n');
    const localParent = (lines.find((l) => l.startsWith('local:')) || '')
      .replace('local:', '')
      .trim();
    const noteParent = (lines.find((l) => l.startsWith('note:')) || '')
      .replace('note:', '')
      .trim();

    const parent =
      (localParent !== '<none>' && localParent) ||
      (noteParent !== '<none>' && noteParent) ||
      '<none>';

    item.text = `$(git-branch) Parent: ${parent}`;
  }

  function debouncedUpdate() {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      update().catch(console.error);
    }, 250);
  }

  update().catch(console.error);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(debouncedUpdate),
    vscode.workspace.onDidSaveTextDocument(debouncedUpdate),
    item,
  );
}

module.exports = { activate, deactivate: () => {} };
```

---

# 7. Packaging & Distribution (VSIX)

### 7.1 Install vsce inside WSL

```bash
npm install -g @vscode/vsce
```

### 7.2 Package the extension

From `.vscode/extensions/parent-branch-status/`:

```bash
vsce package
```

This produces `parent-branch-status-1.2.0.vsix` which can be installed manually in VS Code.

---

# 8. CI Enforcement (GitHub Actions)

Add `.github/workflows/parent-branch-check.yml`:

```yaml
name: Enforce parent branch metadata
on: [pull_request]
jobs:
  check-parent-branch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Fetch notes
        run: git fetch origin 'refs/notes/*:refs/notes/*' || true
      - name: Validate
        run: |
          BRANCH="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD)}"
          if [[ -z "$(git branch-origin show $BRANCH | grep -v '<none>')" ]]; then
            echo "❌ Missing parent-branch metadata. Use 'git new-branch'."
            exit 1
          fi
```
