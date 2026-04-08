# Leantime AutomationApi Plugin Deploy Workflow

Production deployment workflow for the on-prem Leantime `AutomationApi` plugin.

This workflow exists because plugin deployment modifies files inside the live
Leantime installation. Every deploy must be recoverable, hash-verified, and
locally documented.

## Environment Split

Use dedicated Leantime env files instead of `.env.local`:

```text
.env.leantime.example      # tracked production/on-prem template
.env.leantime              # ignored local production/on-prem values
.env.leantime-dev.example  # tracked local Podman template
.env.leantime-dev          # ignored local Podman values
```

`pnpm lt` and `pnpm lt:rpc` load `.env.leantime`.

`pnpm lt:dev`, `pnpm lt:rpc:dev`, and the local Podman stack use
`.env.leantime-dev`.

Do not put Leantime production API keys or session cookies in `.env.local`.
Keep `.env.local` for the Next.js app.

## Target

Current production target:

```text
ssh alias: leantime-hostuno
host: s2.hostuno.com
user: wmitrus
root: domains/leantime.wmitrus.useruno.com/public_html/leantime
plugin: app/Plugins/AutomationApi
```

The recommended local SSH config uses a dedicated key for this instance:

```text
Host leantime-hostuno
  HostName s2.hostuno.com
  User wmitrus
  IdentityFile ~/.ssh/leantime_wmitrus_s2_hostuno_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 30
  ServerAliveCountMax 4
```

`LEANTIME_DEPLOY_HOST` should normally be `leantime-hostuno` so the deployer
uses that dedicated key.

The SSH read-only connectivity probe reached the server but authentication
failed until the public key is added to the remote account:

```text
Permission denied (publickey,keyboard-interactive).
```

This means DNS/network reachability is likely fine, but the local SSH key or
agent access still needs to be authorized before deploy can run from this
session.

## Commands

Create or update the ignored production env file from the tracked template:

```bash
cp .env.leantime.example .env.leantime
```

Plan the deploy without changing remote files:

```bash
pnpm leantime:plugin:plan
```

Apply the deploy:

```bash
pnpm leantime:plugin:deploy
```

The deploy command is equivalent to running the same script with `--apply`.
Without `--apply`, the script is read-only and writes only a local manifest.

## Safety Model

The deploy script is intentionally conservative:

- reads config only from `.env.leantime`
- validates SSH host, user, plugin name, and remote paths before use
- validates local plugin source paths stay inside the repository workspace
- enumerates every plugin file and computes local SHA-256 hashes
- checks the remote Leantime root exists before planning
- reads each remote target SHA-256 before deciding the action
- skips files with identical content
- backs up every existing file before overwriting it
- verifies each backup SHA-256 matches the pre-deploy remote SHA-256
- uploads to a remote staging directory before copying into the live plugin path
- verifies staging SHA-256 equals local SHA-256
- verifies deployed SHA-256 equals local SHA-256
- writes a local manifest for every plan/apply run

## Backup And Rollback

Default remote backup root:

```text
domains/leantime.wmitrus.useruno.com/public_html/leantime/storage/plugin-backups
```

Each apply run writes backups under:

```text
<backup-root>/AutomationApi/<timestamp>/<relative-plugin-file>
```

Example:

```text
domains/leantime.wmitrus.useruno.com/public_html/leantime/storage/plugin-backups/AutomationApi/2026-04-07T12-00-00Z/Services/Ideas.php
```

Rollback is manual and deliberate:

```bash
ssh wmitrus@s2.hostuno.com
cd domains/leantime.wmitrus.useruno.com/public_html/leantime
cp -p storage/plugin-backups/AutomationApi/<timestamp>/<relative-file> app/Plugins/AutomationApi/<relative-file>
```

Use the local manifest to identify the exact timestamp and files.

## Local Deployment Manifests

Default local manifest directory:

```text
logs/leantime-plugin-deployments
```

Each manifest records:

- timestamp
- mode: `plan` or `apply`
- SSH host and user
- remote Leantime root
- backup root
- plugin name
- per-file action: `create`, `overwrite`, or `skip-same`
- local SHA-256
- remote pre-deploy SHA-256 when present
- staging SHA-256 when applied
- backup SHA-256 when an overwrite required a backup
- remote and backup paths

The manifest intentionally does not include API keys, SSH keys, session cookies,
or other credentials.

## Expected First Production Run

Recommended sequence after SSH auth is fixed:

1. Run `pnpm leantime:plugin:plan`.
2. Inspect the generated manifest in `logs/leantime-plugin-deployments/`.
3. Confirm only `app/Plugins/AutomationApi/*` files are planned.
4. Run `pnpm leantime:plugin:deploy`.
5. Inspect the apply manifest and confirm any overwritten files have backup
   paths and matching backup hashes.
6. Run an API smoke test:

```bash
pnpm lt:rpc -- --method leantime.rpc.AutomationApi.AutomationApi.ping --input '{}' --format=json
```

7. Run one safe read or create/list validation for Ideas after confirming the
   plugin is loaded.

## Known Blocker

SSH currently fails from this Codex session with:

```text
Permission denied (publickey,keyboard-interactive).
```

Fix by adding the generated public key to the remote `wmitrus` account, usually
in `~/.ssh/authorized_keys`. Do not put SSH private keys into this repository.
