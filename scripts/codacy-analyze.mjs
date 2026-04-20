#!/usr/bin/env node
/**
 * Runs Codacy static analysis locally using codacy-cli-v2.
 *
 * Prerequisites (one-time setup):
 *   pnpm codacy:install           — installs codacy-cli-v2 binary + tool runtimes
 *
 * Usage:
 *   pnpm codacy:analyze              — local analysis, results to stdout
 *   pnpm codacy:analyze:upload       — analysis + upload SARIF results to Codacy dashboard
 *
 * Environment variables for cloud sync and upload:
 *   CODACY_API_TOKEN     — Personal or Account API token from Codacy > Account > API tokens
 *   CODACY_PROVIDER      — VCS provider: gh (GitHub), gl (GitLab), bb (Bitbucket) [default: gh]
 *   CODACY_ORGANIZATION  — Organization/account name on the provider (e.g. wmitrus)
 *   CODACY_REPOSITORY    — Repository name (e.g. nextjs-16-boilerplate)
 *
 * Cloud config sync:
 *   When CODACY_API_TOKEN + CODACY_PROVIDER + CODACY_ORGANIZATION + CODACY_REPOSITORY are all
 *   set, codacy-cli-v2 fetches tool configurations from Codacy Cloud, matching the exact
 *   patterns enabled in the Codacy UI. Without these, local .codacy/codacy.yaml is used.
 *
 * Note: Tool enable/disable state is set in Codacy UI — not in .codacy.yml or .codacy/codacy.yaml.
 *       For true cloud parity, all four CODACY_* env vars must be set.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import {
  ensureDirectoryWithinBase,
  pathExistsWithinBase,
  readTextFileWithinBase,
  removeFileWithinBase,
  writeTextFileWithinBase,
} from './lib/fs-guards.mjs';

// ─── Configuration ────────────────────────────────────────────────────────────

const PROJECT_DIR = process.cwd();
const BINARY_PATH = resolve(homedir(), '.local', 'bin', 'codacy-cli-v2');
const API_TOKEN = process.env.CODACY_API_TOKEN;
const PROVIDER = process.env.CODACY_PROVIDER ?? 'gh';
const ORGANIZATION = process.env.CODACY_ORGANIZATION;
const REPOSITORY = process.env.CODACY_REPOSITORY;
const UPLOAD = process.env.CODACY_UPLOAD === 'true';
const REPORT_MODE = process.env.CODACY_REPORT_MODE ?? 'stdout';
const TOOL = process.env.CODACY_TOOL ?? 'eslint';
const LOCAL_BIN_DIR = resolve(homedir(), '.local', 'bin');
const CODACY_DIR = resolve(PROJECT_DIR, '.codacy');
const REPORTS_DIR = resolve(PROJECT_DIR, '.codacy', 'reports');
const PERSISTENT_SARIF_FILE = resolve(REPORTS_DIR, 'codacy-results.sarif');
const PERSISTENT_FINDINGS_FILE = resolve(REPORTS_DIR, 'codacy-findings.json');

// ─── Binary check ─────────────────────────────────────────────────────────────

if (!pathExistsWithinBase(BINARY_PATH, LOCAL_BIN_DIR, 'Codacy CLI binary')) {
  console.error(`❌ codacy-cli-v2 not found at: ${BINARY_PATH}`);
  console.error(`\n   Install it first: pnpm codacy:install`);
  process.exit(1);
}

// ─── Cloud sync validation ────────────────────────────────────────────────────

const hasCloudSync = Boolean(API_TOKEN && ORGANIZATION && REPOSITORY);

if (API_TOKEN && (!ORGANIZATION || !REPOSITORY)) {
  console.error(
    `❌ CODACY_API_TOKEN is set but CODACY_ORGANIZATION and CODACY_REPOSITORY are also required for cloud sync.`,
  );
  console.error(
    `   Set all three to enable cloud config fetch, or unset CODACY_API_TOKEN for local-only analysis.`,
  );
  process.exit(1);
}

if (UPLOAD && !hasCloudSync) {
  console.error(
    `❌ CODACY_UPLOAD=true requires CODACY_API_TOKEN, CODACY_ORGANIZATION, and CODACY_REPOSITORY.`,
  );
  process.exit(1);
}

// ─── Report status ────────────────────────────────────────────────────────────

if (hasCloudSync) {
  console.log(`🔑 Cloud sync enabled — fetching Codacy pattern config`);
  console.log(
    `   Provider: ${PROVIDER} | Org: ${ORGANIZATION} | Repo: ${REPOSITORY}`,
  );
} else {
  console.warn(
    `⚠️  Local-only mode — using .codacy/codacy.yaml (no cloud pattern sync).`,
  );
  console.warn(
    `   For cloud parity, set CODACY_API_TOKEN, CODACY_ORGANIZATION, CODACY_REPOSITORY.`,
  );
}

if (UPLOAD) {
  console.log(`📤 Results will be uploaded to Codacy dashboard`);
}

if (REPORT_MODE === 'sarif') {
  console.log(`📝 Persistent SARIF report enabled`);
  console.log(`   Output: ${PERSISTENT_SARIF_FILE}`);
}

if (REPORT_MODE === 'findings') {
  console.log(`📝 Persistent findings report enabled`);
  console.log(`   Output: ${PERSISTENT_FINDINGS_FILE}`);
}

// ─── Build analyze arguments ──────────────────────────────────────────────────

const analyzeArgs = ['analyze', '--tool', TOOL];

if (hasCloudSync) {
  analyzeArgs.push(
    '--api-token',
    API_TOKEN,
    '--provider',
    PROVIDER,
    '--organization',
    ORGANIZATION,
    '--repository',
    REPOSITORY,
  );
}

// ─── Run analysis (with optional SARIF upload) ────────────────────────────────

console.log(`\n🔍 Running Codacy analysis (tool: ${TOOL})...`);
console.log(`   Binary: ${BINARY_PATH}\n`);

function removeIfExists(filePath) {
  removeFileWithinBase(filePath, dirname(resolve(filePath)), 'Codacy artifact');
}

function readJsonFile(filePath) {
  return JSON.parse(
    readTextFileWithinBase(filePath, dirname(resolve(filePath)), 'Codacy JSON'),
  );
}

function writeSarifFile(filePath, value) {
  writeTextFileWithinBase(
    filePath,
    dirname(resolve(filePath)),
    JSON.stringify(value, null, 2),
    'Codacy SARIF output',
  );
}

function writeFindingsFile(filePath, findings) {
  writeTextFileWithinBase(
    filePath,
    dirname(resolve(filePath)),
    `${JSON.stringify(
      {
        findingsCount: findings.length,
        findings,
      },
      null,
      2,
    )}\n`,
    'Codacy findings output',
  );
}

function extractFindings(sarif) {
  const runs = Array.isArray(sarif.runs) ? sarif.runs : [];
  return runs.flatMap((run) =>
    (run.results ?? []).map((result) => {
      const location = result.locations?.[0]?.physicalLocation;
      const uri =
        location?.artifactLocation?.uri?.replace(
          `file://${PROJECT_DIR}/`,
          '',
        ) ?? null;

      return {
        ruleId: result.ruleId ?? null,
        level: result.level ?? 'warning',
        message: result.message?.text ?? '',
        uri,
        line: location?.region?.startLine ?? null,
        column: location?.region?.startColumn ?? null,
      };
    }),
  );
}

if (UPLOAD) {
  // Analyze to SARIF, then upload
  const sarifFile = resolve(tmpdir(), `codacy-results-${Date.now()}.sarif`);
  const analyzeWithFormat = [
    ...analyzeArgs,
    '--format',
    'sarif',
    '--output',
    sarifFile,
  ];

  const analyzeResult = spawnSync(BINARY_PATH, analyzeWithFormat, {
    stdio: 'inherit',
    cwd: PROJECT_DIR,
  });

  if (analyzeResult.error || (analyzeResult.status ?? 0) !== 0) {
    console.error(`\n❌ Analysis failed`);
    process.exit(analyzeResult.status ?? 1);
  }

  // Get current commit SHA for upload
  let commitSha;
  try {
    commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      stdio: 'pipe',
      cwd: PROJECT_DIR,
    })
      .toString()
      .trim();
  } catch {
    console.error(
      `❌ Could not determine current commit SHA (git rev-parse HEAD failed).`,
    );
    removeFileWithinBase(sarifFile, tmpdir(), 'temporary SARIF file');
    process.exit(1);
  }

  console.log(`\n📤 Uploading results to Codacy (commit: ${commitSha})...`);

  const uploadResult = spawnSync(
    BINARY_PATH,
    [
      'upload',
      '--sarif-file',
      sarifFile,
      '--commit-uuid',
      commitSha,
      '-t',
      API_TOKEN,
    ],
    { stdio: 'inherit', cwd: PROJECT_DIR },
  );

  removeFileWithinBase(sarifFile, tmpdir(), 'temporary SARIF file');

  process.exit(uploadResult.status ?? 0);
} else {
  if (REPORT_MODE === 'sarif' || REPORT_MODE === 'findings') {
    // Fixed repository-owned output path keeps report persistence safe and predictable.
    ensureDirectoryWithinBase(
      REPORTS_DIR,
      CODACY_DIR,
      'Codacy reports directory',
    );
    const tempSarifFile = resolve(REPORTS_DIR, '.codacy-results.tmp.sarif');

    const result = spawnSync(
      BINARY_PATH,
      [...analyzeArgs, '--format', 'sarif', '--output', tempSarifFile],
      {
        stdio: 'inherit',
        cwd: PROJECT_DIR,
      },
    );

    if (result.error) {
      console.error(
        `\n❌ Failed to run codacy-cli-v2: ${result.error.message}`,
      );
      process.exit(1);
    }

    const sarif = readJsonFile(tempSarifFile);
    const findings = extractFindings(sarif);

    if (findings.length === 0) {
      removeIfExists(tempSarifFile);
      removeIfExists(PERSISTENT_SARIF_FILE);
      removeIfExists(PERSISTENT_FINDINGS_FILE);
      console.log(
        `\n✅ No findings detected; no persistent artifact was saved.`,
      );
      process.exit(result.status ?? 0);
    }

    if (REPORT_MODE === 'sarif') {
      writeSarifFile(PERSISTENT_SARIF_FILE, sarif);
      removeIfExists(tempSarifFile);
      console.log(`\n✅ SARIF report saved to ${PERSISTENT_SARIF_FILE}`);
      process.exit(result.status ?? 0);
    }

    writeFindingsFile(PERSISTENT_FINDINGS_FILE, findings);
    removeIfExists(tempSarifFile);
    removeIfExists(PERSISTENT_SARIF_FILE);
    console.log(`\n✅ Findings report saved to ${PERSISTENT_FINDINGS_FILE}`);
    process.exit(result.status ?? 0);
  }

  // Analyze and print to stdout
  const result = spawnSync(BINARY_PATH, analyzeArgs, {
    stdio: 'inherit',
    cwd: PROJECT_DIR,
  });

  if (result.error) {
    console.error(`\n❌ Failed to run codacy-cli-v2: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}
