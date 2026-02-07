# Parent Branch Status — Team Installation Guide

## WSL + VSCode Remote + Git Integration

This guide explains exactly how to install and use the **Parent Branch Status System** on any machine using:

- **WSL (Ubuntu)**
- **VSCode Remote**
- **Git**
- **Custom Git extension**: `git-branch-origin`
- **VSCode extension**: `parent-branch-status`

Follow the steps in order. No prior knowledge required.

---

## 1. Prerequisites

You must have:

- **WSL Ubuntu** installed
- **VSCode** installed
- **VSCode Remote – WSL** extension installed
- **Git** installed inside WSL

### Verify Git:

```bash
git --version
```

---

## 2. Install the Git Tool (`git-branch-origin`)

This tool stores and retrieves parent-branch metadata.

### 2.1 Copy the script into `/usr/local/bin`

From the project root:

```bash
sudo cp bin/git-branch-origin /usr/local/bin/
sudo chmod +x /usr/local/bin/git-branch-origin
```

### 2.2 Verify installation

```bash
which git-branch-origin
```

**Expected:**

```text
/usr/local/bin/git-branch-origin
```

### 2.3 Test the tool

```bash
git branch-origin help
```

**Expected usage output.**

---

## 3. Install the VSCode Extension (VSIX)

The extension displays the parent branch in the VSCode status bar.

### 3.1 Download or obtain the `.vsix` file

You should have:

```text
parent-branch-status-1.2.0.vsix
```

### 3.2 Install it inside WSL

Run:

```bash
code --install-extension parent-branch-status-1.2.0.vsix
```

### 3.3 Reload VSCode

1. Press `Ctrl+Shift+P`
2. Run: `Developer: Reload Window`

### 3.4 Verify installation

1. Press `Ctrl+Shift+P`
2. Run: `Developer: Show Running Extensions`
3. Look under **WSL: Ubuntu**

You should see:

```text
Parent Branch Status
```

---

## 4. Using the System

### 4.1 Set a parent branch

```bash
git branch-origin set feature/login main
```

### 4.2 View the parent

```bash
git branch-origin show feature/login
```

### 4.3 View the full chain

```bash
git branch-origin chain feature/login
```

### 4.4 VSCode Status Bar

When you open the repo in VSCode (WSL):

```text
Parent: main
```

**Updates automatically when:**

- Switching branches
- Saving files
- Changing editors
- `.git/HEAD` changes

---

## 5. Troubleshooting

- **5.1 Status bar shows `<none>`**
  - **Cause**: No metadata set.
  - **Fix**: `git branch-origin set <branch> <parent>`

- **5.2 Status bar shows `<detached>`**
  - **Cause**: You are not on a branch.
  - **Fix**: `git checkout <branch>`

- **5.3 Error: `git: 'branch-origin' is not a git command`**
  - **Cause**: Tool not installed globally.
  - **Fix**:
    ```bash
    sudo cp bin/git-branch-origin /usr/local/bin/
    sudo chmod +x /usr/local/bin/git-branch-origin
    ```

- **5.4 VSCode extension not updating after branch switch**
  - **Cause**: Old extension cached.
  - **Fix**:
    ```bash
    rm -rf ~/.vscode-server/extensions/*parent-branch-status*
    ```
    Reinstall VSIX.

- **5.5 Git commands run in wrong directory**
  - **Cause**: VSCode opened a subfolder.
  - **Fix**: Open the repo root:
    ```bash
    code .
    ```

---

## 6. Updating the System

### 6.1 Update Git tool

```bash
sudo cp bin/git-branch-origin /usr/local/bin/
sudo chmod +x /usr/local/bin/git-branch-origin
```

### 6.2 Update VSCode extension

```bash
vsce package
code --install-extension parent-branch-status-1.2.0.vsix --force
```

Reload VSCode.

---

## 7. Summary

After installation:

- `git branch-origin` manages parent metadata
- VSCode shows parent branch in the status bar
- Updates instantly on branch switch
- Works reliably inside WSL

Your environment is now fully configured.
