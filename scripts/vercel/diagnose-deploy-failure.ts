import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface DeploymentResult {
  deploymentApiUrl?: string;
  error?: { message?: string; name?: string };
  id?: string;
  inspectorUrl?: string;
}

interface DeploymentDetails {
  builds?: unknown[];
  errorCode?: string;
  errorMessage?: string;
  id?: string;
  inspectorUrl?: string;
  integrations?: { status?: string };
  team?: { slug?: string };
}

interface IntegrationResource {
  id?: string;
  name?: string;
  product?: string;
  status?: string;
}

export function formatDeploymentFailure(
  deployment: DeploymentDetails,
  resources: IntegrationResource[],
): string {
  const provisioningFailed =
    deployment.integrations?.status === 'error' &&
    Array.isArray(deployment.builds) &&
    deployment.builds.length === 0;

  if (!provisioningFailed) {
    return [
      'Vercel deployment failed.',
      `Reason: ${deployment.errorMessage ?? deployment.errorCode ?? 'unknown'}`,
      deployment.inspectorUrl ? `Inspect: ${deployment.inspectorUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const teamSlug = deployment.team?.slug;
  const resourceLines = resources.map((resource) => {
    const label = [resource.product, resource.name].filter(Boolean).join(' / ');
    const dashboard =
      teamSlug && resource.id
        ? ` https://vercel.com/${teamSlug}/~/stores/integration/${resource.id}`
        : '';
    return `- ${label || resource.id || 'unknown resource'} (status: ${resource.status ?? 'unknown'})${dashboard}`;
  });

  return [
    'VERCEL PREVIEW BLOCKED BEFORE BUILD: marketplace integration provisioning failed.',
    'The application build and database migration did not start.',
    `Vercel reason: ${deployment.errorMessage ?? 'Resource provisioning failed'}`,
    resourceLines.length > 0
      ? `Connected resources:\n${resourceLines.join('\n')}`
      : 'Connected resource details could not be loaded.',
    'For Neon, check the Preview branch quota and the deployment action connection before retrying.',
    deployment.inspectorUrl ? `Deployment: ${deployment.inspectorUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function escapeGitHubCommandData(value: string): string {
  return value
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

function runVercelJson(args: string[]): unknown {
  const cli =
    process.env.VERCEL_CLI_BIN?.trim() ||
    path.resolve(process.cwd(), 'node_modules/.bin/vercel');
  const token = process.env.VERCEL_TOKEN?.trim();
  const commandArgs = [...args];

  if (token) {
    commandArgs.push(`--token=${token}`);
  }

  const output = execFileSync(cli, commandArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

export function diagnoseDeployFailure(resultPath: string): string {
  const result = JSON.parse(
    readFileSync(resultPath, 'utf8'),
  ) as DeploymentResult;
  const deploymentId = result.id;

  if (!deploymentId) {
    return `Vercel deployment failed before returning a deployment ID: ${result.error?.message ?? 'unknown error'}`;
  }

  const deployment = runVercelJson([
    'api',
    `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    '--raw',
  ]) as DeploymentDetails;

  let resources: IntegrationResource[] = [];
  try {
    const response = runVercelJson([
      'integration',
      'list',
      '--format=json',
    ]) as { resources?: IntegrationResource[] };
    resources = response.resources ?? [];
  } catch {
    // Deployment classification remains useful when resource discovery fails.
  }

  return formatDeploymentFailure(deployment, resources);
}

const isMain = process.argv[1]?.endsWith('diagnose-deploy-failure.ts');

if (isMain) {
  const resultPath = process.argv.slice(2).find((arg) => arg !== '--');
  if (!resultPath) {
    console.error(
      'Usage: pnpm vercel:deploy:diagnose -- <vercel-deploy-result.json>',
    );
    process.exit(1);
  }

  try {
    const diagnostic = diagnoseDeployFailure(resultPath);
    console.error(`\n${diagnostic}\n`);
    console.error(
      `::error title=Vercel deployment blocked::${escapeGitHubCommandData(diagnostic)}`,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[vercel-deploy] Could not diagnose deployment: ${message}`);
  }
}
