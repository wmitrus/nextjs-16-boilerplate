# Release Automation

This project uses a GitHub Actions workflow to create releases on every push to `main` via **semantic-release**. The workflow is defined in `.github/workflows/release.yml` and uses a GitHub App token for permissioned release creation.

---

## How the Release Workflow Works

- Trigger: every push to `main`.
- Token: generated from a GitHub App (not a personal access token).
- Action: `pnpm run release` (semantic-release decides the next version based on commit messages).
- Output: GitHub Release + tag (no package publishing).

---

## Prerequisites

1. **Conventional Commits**
   - semantic-release derives versioning from commit messages.
   - Examples:
     - `feat: add user profile` → minor release
     - `fix: correct validation` → patch release
     - `feat!: remove legacy API` or `BREAKING CHANGE:` → major release

2. **Release Script**
   Ensure `package.json` includes:

   ```json
   {
     "scripts": {
       "release": "semantic-release"
     }
   }
   ```

   Install the required packages for this repo’s release config:

   ```bash
   pnpm add -D \
     semantic-release \
     @semantic-release/commit-analyzer \
     @semantic-release/release-notes-generator \
     @semantic-release/npm \
     @semantic-release/changelog \
     @semantic-release/git \
     @semantic-release/github \
     @semantic-release/exec
   ```

3. **semantic-release Config**
   Add a config file (example `.releaserc.json`):
   ```json
   {
     "branches": ["main"],
     "plugins": [
       "@semantic-release/commit-analyzer",
       "@semantic-release/release-notes-generator",
       "@semantic-release/changelog",
       "@semantic-release/github",
       ["@semantic-release/git", { "assets": ["CHANGELOG.md"] }]
     ]
   }
   ```

---

## Create the GitHub App (Required for Secrets)

Semantic-release uses a GitHub App token so it can create tags and releases.

### 1) Create the App

Go to: **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**

**Basic settings**

- GitHub App name: `semantic-release-bot` (or any unique name)
- Homepage URL: your repo URL
- Webhook: **unchecked** (not needed)

**Repository permissions**

- Contents: **Read & write** (required to create tags/releases)
- Pull requests: **Read** (optional but recommended)
- Issues: **Read** (optional)
- Metadata: **Read** (default)

**Subscribe to events**

- No events required.

Create the app.

### 2) Generate a Private Key

On the app page:

- Click **Private keys → Generate a private key**
- Download the `.pem` file

### 3) Install the App

Install the app on the repository **wmitrus/nextjs-16-boilerplate**.

---

## Configure Secrets in GitHub

Go to: **Repo → Settings → Secrets and variables → Actions → New repository secret**

Add these two secrets:

1. `SEMANTIC_RELEASE_GITHUB_APP_ID`
   - Value: the **App ID** shown on your GitHub App settings page

2. `SEMANTIC_RELEASE_GITHUB_APP_PRIVATE_KEY`
   - Value: the **full contents** of the downloaded `.pem` file
   - Paste the entire file including:
     - `-----BEGIN RSA PRIVATE KEY-----`
     - `-----END RSA PRIVATE KEY-----`

---

## Validate the Workflow

1. Merge to `main` with a conventional commit message (e.g. `feat: add feature`).
2. Open **Actions** → **Release** workflow run.
3. Confirm steps:
   - Token generation succeeds
   - Dependencies install
   - `pnpm run release` completes
4. Check **Releases** tab for a new version and changelog.

---

## Troubleshooting

**“No release published”**

- Commit messages may not follow Conventional Commits.
- No changes triggering a version bump.

**“Invalid token / 403”**

- GitHub App not installed on the repo
- App permissions missing Contents: write
- Secret values incorrect

**“semantic-release not found”**

- `semantic-release` not installed in devDependencies
- Missing `release` script in `package.json`

---

## Notes

- This pipeline does **not** publish packages to npm.
- If you later want npm publishing, add `NPM_TOKEN` and the appropriate semantic-release plugin.
