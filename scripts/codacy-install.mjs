#!/usr/bin/env node
/**
 * Downloads and installs the codacy-cli-v2 binary to ~/.local/bin,
 * then installs the configured tool runtimes (ESLint etc.) into .codacy/.
 *
 * Run once before using pnpm codacy:analyze:
 *   pnpm codacy:install
 *
 * Requirements:
 *   - curl available on the system
 *   - ~/.local/bin in PATH (add `export PATH="$HOME/.local/bin:$PATH"` to ~/.bashrc)
 *   - .codacy/codacy.yaml present (already committed to this repository)
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

const BINARY_NAME = 'codacy-cli-v2';
const GITHUB_REPO = 'codacy/codacy-cli-v2';
const INSTALL_DIR = resolve(homedir(), '.local', 'bin');
const BINARY_PATH = resolve(INSTALL_DIR, BINARY_NAME);
const REQUESTED_VERSION = process.env.CODACY_CLI_V2_VERSION?.trim();

function detectPlatformSuffix() {
  const platform = process.platform;
  const arch = process.arch;

  const map = {
    'linux-x64': 'linux_amd64',
    'linux-arm64': 'linux_arm64',
    'darwin-x64': 'darwin_amd64',
    'darwin-arm64': 'darwin_arm64',
  };

  const key = `${platform}-${arch}`;
  // eslint-disable-next-line security/detect-object-injection -- key is derived from process.platform + process.arch (Node.js constants), not user input
  const suffix = map[key];

  if (!suffix) {
    console.error(
      `❌ Unsupported platform: ${platform}/${arch}. Install codacy-cli-v2 manually:`,
    );
    console.error(`   https://github.com/${GITHUB_REPO}/releases/latest`);
    process.exit(1);
  }

  return suffix;
}

function fetchLatestRelease() {
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const response = execFileSync(
    'curl',
    ['-fsSL', apiUrl, '-H', 'Accept: application/vnd.github.v3+json'],
    { stdio: 'pipe' },
  ).toString();

  const data = JSON.parse(response);
  return data.tag_name;
}

function resolveTargetVersion() {
  if (REQUESTED_VERSION) {
    return REQUESTED_VERSION;
  }

  return fetchLatestRelease();
}

function isInstalled() {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- BINARY_PATH is resolve(homedir(), '.local', 'bin', 'codacy-cli-v2') — no user input
  return existsSync(BINARY_PATH);
}

function getCurrentVersion() {
  try {
    return execFileSync(BINARY_PATH, ['--version'], { stdio: 'pipe' })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function waitForChildProcess(child, commandName) {
  return new Promise((resolvePromise, rejectPromise) => {
    child.once('error', (error) => {
      rejectPromise(error);
    });
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      if (signal) {
        rejectPromise(
          new Error(`${commandName} exited due to signal ${signal}`),
        );
        return;
      }

      rejectPromise(
        new Error(`${commandName} exited with code ${code ?? 'unknown'}`),
      );
    });
  });
}

async function downloadAndExtractArchive(downloadUrl) {
  const curl = spawn('curl', ['-fsSL', downloadUrl], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const tar = spawn('tar', ['xz', '-C', INSTALL_DIR, BINARY_NAME], {
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  await Promise.all([
    pipeline(curl.stdout, tar.stdin),
    waitForChildProcess(curl, 'curl'),
    waitForChildProcess(tar, 'tar'),
  ]);
}

// ─── Install binary ────────────────────────────────────────────────────────────

const installedVersion = isInstalled() ? getCurrentVersion() : null;

if (
  installedVersion &&
  (!REQUESTED_VERSION || installedVersion === REQUESTED_VERSION)
) {
  console.log(
    `✅ codacy-cli-v2 already installed: ${installedVersion ?? 'unknown version'}`,
  );
  console.log(`   Path: ${BINARY_PATH}`);
} else {
  const tag = resolveTargetVersion();
  const suffix = detectPlatformSuffix();
  const archive = `${BINARY_NAME}_${tag}_${suffix}.tar.gz`;
  const downloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${archive}`;

  if (REQUESTED_VERSION) {
    console.log(`⬇️  Installing pinned codacy-cli-v2 version...`);
  } else {
    console.log(`⬇️  Fetching latest codacy-cli-v2 release...`);
  }
  console.log(`   Tag:    ${tag}`);
  console.log(`   Source: ${downloadUrl}`);
  console.log(`   Target: ${INSTALL_DIR}`);

  if (
    installedVersion &&
    REQUESTED_VERSION &&
    installedVersion !== REQUESTED_VERSION
  ) {
    console.log(`   Replacing installed version: ${installedVersion}`);
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- INSTALL_DIR is resolve(homedir(), '.local', 'bin') — no user input
  if (!existsSync(INSTALL_DIR)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- same rationale as above
    mkdirSync(INSTALL_DIR, { recursive: true });
  }

  try {
    await downloadAndExtractArchive(downloadUrl);
    execFileSync('chmod', ['+x', BINARY_PATH], { stdio: 'pipe' });

    const version = getCurrentVersion();
    console.log(`\n✅ codacy-cli-v2 installed: ${version ?? tag}`);
    console.log(`   Path: ${BINARY_PATH}`);
  } catch (error) {
    console.error(
      `\n❌ Installation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(
      `   Try manually: https://github.com/${GITHUB_REPO}/releases/latest`,
    );
    process.exit(1);
  }
}

console.log(
  `\n   Ensure ~/.local/bin is in your PATH. Add to ~/.bashrc if missing:`,
);
console.log(`   export PATH="$HOME/.local/bin:$PATH"`);

// ─── Install tool runtimes ─────────────────────────────────────────────────────

console.log(
  `\n⚙️  Installing tool runtimes (ESLint, Node) from .codacy/codacy.yaml...`,
);

try {
  execFileSync(BINARY_PATH, ['install'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  console.log(
    `\n✅ Tool runtimes installed. You can now run: pnpm codacy:analyze`,
  );
} catch (error) {
  console.error(
    `\n❌ Tool runtime installation failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
