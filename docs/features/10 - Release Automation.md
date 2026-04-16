# Release Automation

This project uses a GitHub Actions workflow to create releases via **semantic-release** only after the production deployment workflow succeeds on `main`. The workflow is defined in `.github/workflows/release.yml` and uses a GitHub App token for permissioned release creation. A separate final workflow, `.github/workflows/new-relic-change-tracking.yml`, emits the New Relic production deployment event from the published release.

---

## How the Release Workflow Works

- Trigger: successful completion of the `Production Deployment` workflow for `main`.
- Token: generated from a GitHub App (not a personal access token).
- Checkout target: the exact deployed commit via `github.event.workflow_run.head_sha`.
- Action: `pnpm run release` (semantic-release decides the next version based on commit messages).
- Output: GitHub Release + tag (no package publishing).
- New Relic: the dedicated change-tracking workflow runs afterward on `release.published`, normalizes the semantic version from the published tag, resolves the tagged commit, and emits the production deployment event.

This keeps release creation in a separate workflow file while ensuring a release is attempted only after production deployment succeeds, and New Relic is notified only from the final published-release stage.

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
2. Confirm the **Production Deployment** workflow completes successfully.
3. Open **Actions** → **Release** workflow run.
4. Confirm steps:
   - Token generation succeeds

- Repository checks out the deployed commit SHA from the triggering production workflow
- Dependencies install
- `pnpm run release` completes

5. Open **Actions** → **New Relic Change Tracking** workflow run.
6. Confirm steps:

- Workflow was triggered by the published release
- Release version is normalized from the tag
- Tagged commit is resolved
- New Relic deployment event is created

7. Check **Releases** tab for a new version and changelog.

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
- This pipeline is not the source of truth for production deployment. Production rollout is still owned by `prod-deploy.yml`.
- New Relic production deployment tracking is emitted from the dedicated `new-relic-change-tracking.yml` workflow only after successful production deployment and successful semantic-release publication.
- The visible New Relic `version` is the semantic-release version normalized from the published tag, while `commit` is resolved from that release tag.
