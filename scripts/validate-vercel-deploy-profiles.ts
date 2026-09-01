import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertPathWithinBase,
  readTextFileWithinBase,
} from './lib/fs-guards-shared';
import { parseVercelDeployDryRunOutput } from './validate-vercel-prebuilt-artifact';
import { PUBLIC_PREBUILT_ENV_TEMPLATE_IGNORE_RULES } from './vercel/prebuilt-env-template-policy';

const PREVIEW_REQUIRED_SOURCE_PATHS = [
  'next.config.ts',
  'package.json',
  'e2e/env-files.ts',
  'e2e/internal-api-key.ts',
  'src/core/db/migrations/generated/meta/_journal.json',
];
const PREBUILT_RUNTIME_PATHS = ['/.next', '/node_modules', '/src'];
const VERCEL_RUNTIME_SMOKE_SPEC = 'vercel-runtime-smoke.spec.ts';

function parseIgnoreRules(content: string): Set<string> {
  return new Set(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#')),
  );
}

export function assertVercelDeployProfilesValid(
  previewIgnoreContent: string,
  prebuiltIgnoreContent: string,
): void {
  const previewRules = parseIgnoreRules(previewIgnoreContent);
  const prebuiltRules = parseIgnoreRules(prebuiltIgnoreContent);

  if (previewRules.has('/src') || previewRules.has('src')) {
    throw new Error(
      '[vercel-deploy] Default .vercelignore must include src for preview source builds.',
    );
  }

  for (const requiredTemplate of PUBLIC_PREBUILT_ENV_TEMPLATE_IGNORE_RULES) {
    if (!prebuiltRules.has(requiredTemplate)) {
      throw new Error(
        `[vercel-deploy] Production prebuilt profile must include tracked public template ${requiredTemplate.slice(1)} because Vercel filePathMap may require it.`,
      );
    }
  }

  for (const runtimePath of PREBUILT_RUNTIME_PATHS) {
    if (
      prebuiltRules.has(runtimePath) ||
      prebuiltRules.has(runtimePath.slice(1))
    ) {
      throw new Error(
        `[vercel-deploy] Production prebuilt profile must not exclude ${runtimePath}; generated filePathMap entries may reference it.`,
      );
    }
  }
}

export function assertVercelPreviewSourceUploadValid(
  dryRunOutput: string,
): void {
  const { uploadedPaths } = parseVercelDeployDryRunOutput(dryRunOutput);
  const missingPaths = PREVIEW_REQUIRED_SOURCE_PATHS.filter(
    (requiredPath) => !uploadedPaths.has(requiredPath),
  );

  if (missingPaths.length > 0) {
    throw new Error(
      '[vercel-deploy] Preview source upload is missing required build input(s):\n' +
        missingPaths.map((missingPath) => `  - ${missingPath}`).join('\n'),
    );
  }
}

export function assertVercelProductionMigrationOwnershipValid(
  workflowContent: string,
): void {
  if (!/\bvercel\s+build\s+--prod\b/.test(workflowContent)) {
    throw new Error(
      '[vercel-deploy] Production workflow must build through vercel build --prod.',
    );
  }

  if (workflowContent.includes('pnpm db:migrate:prod')) {
    throw new Error(
      '[vercel-deploy] Production workflow must not run pnpm db:migrate:prod separately; the Vercel Project Build Command owns the migration.',
    );
  }
}

/**
 * Two pushes/merges to `main` must not run overlapping Production deployment
 * pipelines. This enforces the self-validating half of that contract: the
 * real `prod-deploy.yml` must carry exactly one TOP-LEVEL `concurrency:`
 * block whose DIRECT children include exactly one `group` (`production-
 * deployment`) and exactly one `cancel-in-progress` (`false`) -- a later
 * Production deployment waits for the active one; it never cancels it.
 *
 * Deterministic, indentation-aware line parser (no YAML dependency). It
 * preserves each line's indentation, derives the concurrency block's
 * direct-child indent from its body, and only lines at that exact indent may
 * satisfy `group` / `cancel-in-progress`. Nested descendants (e.g. under an
 * intervening key), duplicate `group` / `cancel-in-progress` keys, and
 * multiple top-level `concurrency:` blocks all fail closed.
 */
export function assertVercelProductionConcurrencyContractValid(
  workflowContent: string,
): void {
  const stripComment = (value: string): string => {
    const hashIndex = value.indexOf('#');
    return (hashIndex === -1 ? value : value.slice(0, hashIndex)).trim();
  };
  const unquote = (value: string): string => {
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")));
    return quoted ? value.slice(1, -1) : value;
  };
  const indentOf = (line: string): number =>
    line.length - line.trimStart().length;

  // One record per line: indentation from the raw line, content with any
  // trailing/whole-line comment removed and trimmed. Blank / comment-only
  // lines have content === ''.
  const parsed = workflowContent.split(/\r?\n/).map((raw, index) => ({
    content: stripComment(raw),
    indent: indentOf(raw),
    index,
  }));

  const topLevelConcurrency = parsed.filter(
    (line) => line.indent === 0 && line.content === 'concurrency:',
  );

  if (topLevelConcurrency.length === 0) {
    const nested = parsed.some(
      (line) => line.indent > 0 && line.content === 'concurrency:',
    );
    throw new Error(
      nested
        ? '[vercel-deploy] Production workflow concurrency must be a TOP-LEVEL block; an indented/job-level concurrency does not serialize Production deployments.'
        : '[vercel-deploy] Production workflow must declare a top-level concurrency block (group: production-deployment, cancel-in-progress: false) so overlapping Production deployments serialize.',
    );
  }

  if (topLevelConcurrency.length > 1) {
    throw new Error(
      '[vercel-deploy] Production workflow must declare exactly one top-level concurrency block.',
    );
  }

  const [header] = topLevelConcurrency;

  // Block body: every subsequent line until the next column-0 key. Blank /
  // comment-only lines are skipped, not treated as terminators.
  const body: Array<{ content: string; indent: number }> = [];
  for (const line of parsed.slice(header.index + 1)) {
    if (line.content === '') {
      continue;
    }
    if (line.indent === 0) {
      break;
    }
    body.push(line);
  }

  if (body.length === 0) {
    throw new Error(
      '[vercel-deploy] Production workflow concurrency block must declare direct group and cancel-in-progress children.',
    );
  }

  // Direct children share the shallowest indentation in the body; anything
  // deeper is a nested descendant and cannot satisfy the contract.
  const childIndent = Math.min(...body.map((line) => line.indent));
  const directChildValues = (key: string): string[] =>
    body
      .filter((line) => line.indent === childIndent)
      .map((line) => {
        const colon = line.content.indexOf(':');
        return colon === -1
          ? undefined
          : {
              key: line.content.slice(0, colon).trim(),
              value: unquote(line.content.slice(colon + 1).trim()),
            };
      })
      .filter(
        (entry): entry is { key: string; value: string } =>
          entry !== undefined && entry.key === key,
      )
      .map((entry) => entry.value);

  const groupValues = directChildValues('group');
  const cancelValues = directChildValues('cancel-in-progress');

  if (groupValues.length !== 1) {
    throw new Error(
      '[vercel-deploy] Production workflow concurrency must declare exactly one direct "group" key.',
    );
  }
  if (cancelValues.length !== 1) {
    throw new Error(
      '[vercel-deploy] Production workflow concurrency must declare exactly one direct "cancel-in-progress" key.',
    );
  }

  const [groupValue] = groupValues;
  const [cancelValue] = cancelValues;

  if (groupValue !== 'production-deployment') {
    throw new Error(
      '[vercel-deploy] Production workflow concurrency group must be exactly "production-deployment".',
    );
  }
  if (cancelValue !== 'false') {
    throw new Error(
      '[vercel-deploy] Production workflow concurrency cancel-in-progress must be exactly false; a later Production deployment must wait for the active one, never cancel it.',
    );
  }
}

export function assertVercelProductionReadinessVerificationValid(
  workflowContent: string,
): void {
  const requiredFragments = [
    './node_modules/.bin/vercel deploy --prebuilt --prod --skip-domain --yes --json',
    'DEPLOY_URL=$(node -e',
    'inspect "${{ steps.vercel_deploy.outputs.production_url }}" --wait --json',
    "readyState: 'READY'",
    "target: 'production'",
    'pnpm tenant:readiness:vercel:prod',
    'pnpm vercel:runtime:smoke',
    './node_modules/.bin/vercel promote "${{ steps.vercel_deploy.outputs.production_url }}"',
  ];
  const missingFragments = requiredFragments.filter(
    (fragment) => !workflowContent.includes(fragment),
  );

  if (missingFragments.length > 0) {
    throw new Error(
      '[vercel-deploy] Production workflow must inspect the deployed prebuilt artifact and require READY production state. Missing:\n' +
        missingFragments.map((fragment) => `  - ${fragment}`).join('\n'),
    );
  }

  if (workflowContent.includes('deployment.prebuilt')) {
    throw new Error(
      '[vercel-deploy] Production workflow must not require deployment.prebuilt from vercel inspect JSON; the field is absent from observed CLI output.',
    );
  }

  const smokeIndex = workflowContent.indexOf('pnpm vercel:runtime:smoke');
  const buildIndex = workflowContent.indexOf(
    './node_modules/.bin/vercel build --prod',
  );
  const tenantReadinessIndex = workflowContent.indexOf(
    'pnpm tenant:readiness:vercel:prod',
  );
  const deployIndex = workflowContent.indexOf(
    './node_modules/.bin/vercel deploy --prebuilt --prod --skip-domain --yes --json',
  );
  const promoteIndex = workflowContent.indexOf(
    './node_modules/.bin/vercel promote "${{ steps.vercel_deploy.outputs.production_url }}"',
  );
  if (
    buildIndex === -1 ||
    tenantReadinessIndex <= buildIndex ||
    deployIndex <= tenantReadinessIndex
  ) {
    throw new Error(
      '[vercel-deploy] Production tenant readiness must run after migrations in vercel build and before the prebuilt deployment upload.',
    );
  }

  if (smokeIndex === -1 || promoteIndex <= smokeIndex) {
    throw new Error(
      '[vercel-deploy] Production must smoke-test the staged deployment before promotion.',
    );
  }
}

export function assertVercelToolingAndProvenanceValid(
  packageContent: string,
  previewWorkflowContent: string,
  productionWorkflowContent: string,
): void {
  const packageJson = JSON.parse(packageContent) as {
    devDependencies?: Record<string, string>;
  };
  const vercelVersion = packageJson.devDependencies?.vercel;

  if (!vercelVersion || !/^\d+\.\d+\.\d+$/.test(vercelVersion)) {
    throw new Error(
      '[vercel-deploy] Vercel CLI must be pinned to one exact devDependency version.',
    );
  }

  const combinedWorkflows = `${previewWorkflowContent}\n${productionWorkflowContent}`;
  if (
    combinedWorkflows.includes('vercel@latest') ||
    !previewWorkflowContent.includes('./node_modules/.bin/vercel') ||
    !productionWorkflowContent.includes('./node_modules/.bin/vercel')
  ) {
    throw new Error(
      '[vercel-deploy] Preview and production must use the lockfile-pinned Vercel CLI.',
    );
  }

  const requiredPreviewFragments = [
    'ref: ${{ github.event.pull_request.head.sha }}',
    'test "$(git rev-parse HEAD)" = "$PREVIEW_GIT_SHA"',
    'pnpm exec playwright install --with-deps chromium',
    'pnpm vercel:runtime:smoke',
    'name: Verify Preview Runtime',
    'needs: deploy-preview',
    'PLAYWRIGHT_TEST_BASE_URL: ${{ needs.deploy-preview.outputs.preview_url }}',
    './node_modules/.bin/vercel deploy --yes --json',
    'if [ $DEPLOY_EXIT -ne 0 ]; then',
    'pnpm vercel:deploy:diagnose -- /tmp/vercel-preview-deploy.json',
    'pnpm neon:preview:check -- --git-branch="$PREVIEW_GIT_BRANCH" --cleanup-obsolete',
    'NEON_API_KEY: ${{ secrets.NEON_API_KEY }}',
    'NEON_PROJECT_ID: ${{ secrets.NEON_PROJECT_ID }}',
  ];
  const requiredProductionFragments = [
    'VERCEL_PREBUILT_DEPLOYMENT_ID: ${{ github.run_id }}-${{ github.run_attempt }}',
    'VERCEL_PREBUILT_DEPLOYMENT_ID="${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"',
    '--meta githubCommitSha="$GITHUB_SHA"',
    'pnpm exec playwright install --with-deps chromium',
    'pnpm tenant:readiness:vercel:prod',
    'pnpm vercel:runtime:smoke',
  ];
  const missing = [
    ...requiredPreviewFragments.filter(
      (fragment) => !previewWorkflowContent.includes(fragment),
    ),
    ...requiredProductionFragments.filter(
      (fragment) => !productionWorkflowContent.includes(fragment),
    ),
  ];

  if (missing.length > 0) {
    throw new Error(
      '[vercel-deploy] Deployment provenance/runtime guards are incomplete. Missing:\n' +
        missing.map((fragment) => `  - ${fragment}`).join('\n'),
    );
  }
}

export function assertVercelDeploymentIdContractValid(
  nextConfigContent: string,
  productionWorkflowContent: string,
): void {
  if (
    nextConfigContent.includes('process.env.NEXT_DEPLOYMENT_ID') ||
    // eslint-disable-next-line security/detect-unsafe-regex -- one bounded optional group (export\s+)? plus a literal, no nested/ambiguous repetition; cannot backtrack catastrophically.
    /\b(?:export\s+)?NEXT_DEPLOYMENT_ID\s*=/.test(productionWorkflowContent) ||
    /(?:^|\n)\s*NEXT_DEPLOYMENT_ID\s*:/.test(productionWorkflowContent) ||
    nextConfigContent.includes('runtimeServerDeploymentId')
  ) {
    throw new Error(
      '[vercel-deploy] NEXT_DEPLOYMENT_ID and runtimeServerDeploymentId are reserved for Vercel-managed build/runtime identity; a prebuilt build must use the custom deploymentId value embedded at build time.',
    );
  }

  if (
    !nextConfigContent.includes('process.env.VERCEL_PREBUILT_DEPLOYMENT_ID') ||
    !productionWorkflowContent.includes(
      'VERCEL_PREBUILT_DEPLOYMENT_ID: ${{ github.run_id }}-${{ github.run_attempt }}',
    ) ||
    !productionWorkflowContent.includes(
      'VERCEL_PREBUILT_DEPLOYMENT_ID="${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"',
    )
  ) {
    throw new Error(
      '[vercel-deploy] Production prebuilt builds must provide a unique custom deploymentId through VERCEL_PREBUILT_DEPLOYMENT_ID.',
    );
  }

  if (!productionWorkflowContent.includes('${NEXT_DEPLOYMENT_ID:-}')) {
    throw new Error(
      '[vercel-deploy] Production must fail before building when NEXT_DEPLOYMENT_ID is supplied by project configuration.',
    );
  }
}

export function assertVercelRuntimeSmokeConfigValid(
  smokeConfigContent: string,
): void {
  if (
    !smokeConfigContent.includes('testMatch') ||
    !smokeConfigContent.includes(VERCEL_RUNTIME_SMOKE_SPEC)
  ) {
    throw new Error(
      `[vercel-deploy] Hosted runtime smoke must be restricted to ${VERCEL_RUNTIME_SMOKE_SPEC}; otherwise Playwright runs the full E2E suite against Preview.`,
    );
  }
}

export function assertNextRuntimeTraceGuardValid(
  nextConfigContent: string,
): void {
  if (
    nextConfigContent.includes('outputFileTracingIncludes') ||
    nextConfigContent.includes('outputFileTracingExcludes')
  ) {
    throw new Error(
      '[vercel-deploy] Next.js output file tracing must remain automatic; repository-wide include/exclude overrides can break pnpm-backed Vercel function packaging.',
    );
  }
}

function readAllowedFile(filePath: string, label: string): string {
  const allowedBaseDirs = [process.cwd(), tmpdir()];
  const safePath = allowedBaseDirs
    .map((baseDir) => {
      try {
        return assertPathWithinBase(filePath, baseDir, label);
      } catch {
        return undefined;
      }
    })
    .find((resolvedPath): resolvedPath is string => Boolean(resolvedPath));

  if (!safePath) {
    throw new Error(
      `[vercel-deploy] ${label} must be inside the repository or the system temp directory.`,
    );
  }

  return readTextFileWithinBase(safePath, path.dirname(safePath), label);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const equalsArg = args.find((arg) => arg.startsWith(`${flag}=`));
  if (equalsArg) {
    return equalsArg.slice(flag.length + 1);
  }

  const flagIndex = args.indexOf(flag);
  return flagIndex === -1 ? undefined : args[flagIndex + 1];
}

/* v8 ignore start -- CLI console/process wrapper; exported functions are unit-tested. */
function main(): void {
  const args = process.argv.slice(2);
  const previewDryRunPath = getFlagValue(args, '--preview-dry-run-json');

  if (previewDryRunPath) {
    assertVercelPreviewSourceUploadValid(
      readAllowedFile(previewDryRunPath, 'Vercel preview dry-run JSON'),
    );
    console.log(
      `[vercel-deploy] Preview source upload valid: ${PREVIEW_REQUIRED_SOURCE_PATHS.length} required build input(s) present.`,
    );
    return;
  }

  const repositoryRoot = process.cwd();
  assertVercelDeployProfilesValid(
    readAllowedFile(
      path.resolve(repositoryRoot, '.vercelignore'),
      'preview upload profile',
    ),
    readAllowedFile(
      path.resolve(repositoryRoot, '.vercelignore.prebuilt'),
      'production prebuilt upload profile',
    ),
  );
  assertVercelProductionMigrationOwnershipValid(
    readAllowedFile(
      path.resolve(repositoryRoot, '.github/workflows/prod-deploy.yml'),
      'production deployment workflow',
    ),
  );
  assertVercelProductionReadinessVerificationValid(
    readAllowedFile(
      path.resolve(repositoryRoot, '.github/workflows/prod-deploy.yml'),
      'production deployment workflow',
    ),
  );
  assertVercelProductionConcurrencyContractValid(
    readAllowedFile(
      path.resolve(repositoryRoot, '.github/workflows/prod-deploy.yml'),
      'production deployment workflow',
    ),
  );
  const previewWorkflowContent = readAllowedFile(
    path.resolve(repositoryRoot, '.github/workflows/preview-deploy.yml'),
    'preview deployment workflow',
  );
  const productionWorkflowContent = readAllowedFile(
    path.resolve(repositoryRoot, '.github/workflows/prod-deploy.yml'),
    'production deployment workflow',
  );
  assertVercelToolingAndProvenanceValid(
    readAllowedFile(path.resolve(repositoryRoot, 'package.json'), 'package'),
    previewWorkflowContent,
    productionWorkflowContent,
  );
  assertVercelDeploymentIdContractValid(
    readAllowedFile(
      path.resolve(repositoryRoot, 'next.config.ts'),
      'Next.js configuration',
    ),
    productionWorkflowContent,
  );
  assertNextRuntimeTraceGuardValid(
    readAllowedFile(
      path.resolve(repositoryRoot, 'next.config.ts'),
      'Next.js configuration',
    ),
  );
  assertVercelRuntimeSmokeConfigValid(
    readAllowedFile(
      path.resolve(repositoryRoot, 'playwright.vercel-smoke.config.ts'),
      'Vercel runtime smoke configuration',
    ),
  );
  console.log('[vercel-deploy] Preview and production upload profiles valid.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
/* v8 ignore stop */
