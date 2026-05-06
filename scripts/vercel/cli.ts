import '../load-env-files';

import { spawn } from 'node:child_process';

type CommandName = 'help' | 'inspect-logs' | 'whoami';

const CONTROL_TOKENS = new Set(['--', '--wait']);

interface ParsedCliArgs {
  command: CommandName;
  deploymentTarget?: string;
  wait: boolean;
  passthroughArgs: string[];
}

interface VercelCliInvocation {
  command: string;
  args: string[];
}

function stripNewRelicPreload(
  nodeOptions: string | undefined,
): string | undefined {
  if (!nodeOptions) {
    return undefined;
  }

  const tokens = nodeOptions.trim().split(/\s+/);
  const sanitized: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '-r' || token === '--require') {
      const nextToken = tokens[index + 1];

      if (nextToken === 'newrelic') {
        index += 1;
        continue;
      }
    }

    if (token === '-rnewrelic' || token === '--requirenewrelic') {
      continue;
    }

    sanitized.push(token);
  }

  return sanitized.length > 0 ? sanitized.join(' ') : undefined;
}

export function buildVercelChildEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const childEnv = { ...env };
  const sanitizedNodeOptions = stripNewRelicPreload(env.NODE_OPTIONS);

  if (sanitizedNodeOptions) {
    childEnv.NODE_OPTIONS = sanitizedNodeOptions;
  } else {
    delete childEnv.NODE_OPTIONS;
  }

  return childEnv;
}

function printHelp(): void {
  console.log('Vercel helper');
  console.log('');
  console.log('Usage:');
  console.log('  pnpm vercel:whoami');
  console.log('  pnpm vercel:inspect:logs -- <deployment-url-or-alias>');
  console.log('  pnpm vercel:inspect:logs:wait -- <deployment-url-or-alias>');
  console.log('');
  console.log('Environment:');
  console.log(
    '  VERCEL_TOKEN        Optional. Passed through as --token=... when set.',
  );
  console.log(
    '  VERCEL_CLI_BIN      Optional. Overrides the executable used instead of npx.',
  );
  console.log('');
  console.log('Examples:');
  console.log('  pnpm vercel:whoami');
  console.log('  pnpm vercel:inspect:logs -- https://my-preview.vercel.app');
  console.log('  pnpm vercel:inspect:logs:wait -- my-alias.vercel.app');
}

export function parseCliArgs(argv = process.argv): ParsedCliArgs {
  const tokens = argv.slice(2).filter((token, index) => {
    return !(index === 0 && token === '--');
  });
  const commandToken = tokens[0];

  if (
    commandToken === undefined ||
    commandToken === 'help' ||
    commandToken === '--help' ||
    commandToken === '-h'
  ) {
    return {
      command: 'help',
      wait: false,
      passthroughArgs: [],
    };
  }

  if (commandToken === 'whoami') {
    return {
      command: 'whoami',
      wait: false,
      passthroughArgs: tokens.slice(1),
    };
  }

  if (commandToken !== 'inspect-logs') {
    throw new Error(
      `Unknown command "${commandToken}". Use \`whoami\`, \`inspect-logs\`, or \`help\`.`,
    );
  }

  let wait = false;
  let deploymentTarget: string | undefined;
  const passthroughArgs: string[] = [];

  for (const token of tokens.slice(1)) {
    if (CONTROL_TOKENS.has(token) && token.endsWith('wait')) {
      wait = true;
      continue;
    }

    if (CONTROL_TOKENS.has(token)) {
      continue;
    }

    if (deploymentTarget === undefined && !token.startsWith('--')) {
      deploymentTarget = token;
      continue;
    }

    passthroughArgs.push(token);
  }

  return {
    command: 'inspect-logs',
    deploymentTarget,
    wait,
    passthroughArgs,
  };
}

function resolveVercelCommand(env: NodeJS.ProcessEnv): VercelCliInvocation {
  const customCliBin = env.VERCEL_CLI_BIN?.trim();

  if (customCliBin) {
    return {
      command: customCliBin,
      args: [],
    };
  }

  return {
    command: 'npx',
    args: ['-y', 'vercel@latest'],
  };
}

export function buildVercelCliInvocation(
  parsed: ParsedCliArgs,
  env: NodeJS.ProcessEnv = process.env,
): VercelCliInvocation {
  const base = resolveVercelCommand(env);
  const token = env.VERCEL_TOKEN?.trim();
  const args = [...base.args];

  if (parsed.command === 'whoami') {
    args.push('whoami', ...parsed.passthroughArgs);
  }

  if (parsed.command === 'inspect-logs') {
    if (!parsed.deploymentTarget) {
      throw new Error(
        'Missing deployment target. Example: `pnpm vercel:inspect:logs -- https://my-preview.vercel.app`.',
      );
    }

    args.push('inspect', parsed.deploymentTarget, '--logs');

    if (parsed.wait) {
      args.push('--wait');
    }

    args.push(...parsed.passthroughArgs);
  }

  if (token && !args.some((arg) => arg.startsWith('--token='))) {
    args.push(`--token=${token}`);
  }

  return {
    command: base.command,
    args,
  };
}

async function runExternalCommand(
  invocation: VercelCliInvocation,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      stdio: 'inherit',
      env: buildVercelChildEnv(),
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`Vercel CLI terminated with signal ${signal}.`));
        return;
      }

      reject(new Error(`Vercel CLI exited with code ${code ?? 'unknown'}.`));
    });
  });
}

export async function run(argv = process.argv): Promise<void> {
  const parsed = parseCliArgs(argv);

  if (parsed.command === 'help') {
    printHelp();
    return;
  }

  const invocation = buildVercelCliInvocation(parsed);
  await runExternalCommand(invocation);
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('/cli.ts') ||
    process.argv[1].endsWith('/cli.js') ||
    process.argv[1].endsWith('/cli'));

if (isMain) {
  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[vercel] Fatal error: ${message}`);
    process.exit(1);
  });
}
