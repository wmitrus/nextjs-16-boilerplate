import { env } from '@/core/env';

export interface NerdGraphConfigInput {
  accountId?: number | string;
  apiUrl?: string;
  userApiKey?: string;
}

export interface NerdGraphConfig {
  accountId: number;
  apiUrl: string;
  userApiKey: string;
}

export interface NerdGraphError {
  message: string;
}

export interface NerdGraphResponse<TData> {
  data?: TData;
  errors?: NerdGraphError[];
}

export type ResultRow = Record<string, unknown>;

interface NrqlEnvelope {
  actor?: {
    account?: {
      nrql?: {
        results?: ResultRow[];
      };
    };
  };
}

export function parseCliFlag(argv: string[], name: string): string | undefined {
  const inlinePrefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(inlinePrefix));

  if (inline) {
    return inline.slice(inlinePrefix.length).trim();
  }

  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;

  const value = argv[index + 1];
  if (typeof value !== 'string' || value.startsWith('--')) {
    return undefined;
  }

  return value.trim();
}

export function parseOutputFormat(argv: string[]): 'json' | 'table' {
  return parseCliFlag(argv, 'format') === 'json' ? 'json' : 'table';
}

export function parseView(argv: string[]): 'full' | 'compact' {
  const view = parseCliFlag(argv, 'view');

  if (view === 'compact') {
    return 'compact';
  }

  return 'full';
}

export function parsePositionalArgs(argv: string[]): string[] {
  const positional: string[] = [];
  let skipNext = false;

  for (const current of argv.slice(2)) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (current === '--') continue;

    if (
      current === '--format' ||
      current === '--account' ||
      current === '--nrql' ||
      current === '--view'
    ) {
      skipNext = true;
      continue;
    }

    if (
      current.startsWith('--format=') ||
      current.startsWith('--account=') ||
      current.startsWith('--nrql=') ||
      current.startsWith('--view=')
    ) {
      continue;
    }

    positional.push(current);
  }

  return positional;
}

export function extractNrqlFromArgv(argv: string[]): string {
  const flagValue = parseCliFlag(argv, 'nrql');

  if (flagValue) {
    return flagValue;
  }

  const positional = parsePositionalArgs(argv);
  const query = positional.join(' ').trim();

  if (!query) {
    throw new Error(
      'Missing NRQL query. Pass it as `--nrql=\"SELECT ...\"` or after `--`.',
    );
  }

  return query;
}

export function resolveNerdGraphConfig(
  input: NerdGraphConfigInput,
): NerdGraphConfig {
  const apiUrl = input.apiUrl?.trim();
  if (!apiUrl) {
    throw new Error(
      'NEW_RELIC_NERDGRAPH_API_URL is required. Use https://api.newrelic.com/graphql for US or https://api.eu.newrelic.com/graphql for EU.',
    );
  }

  const userApiKey = input.userApiKey?.trim();
  if (!userApiKey) {
    throw new Error(
      'NEW_RELIC_USER_API_KEY is required for NerdGraph queries.',
    );
  }

  const rawAccountId =
    typeof input.accountId === 'number'
      ? input.accountId
      : Number(input.accountId?.trim());

  if (!Number.isInteger(rawAccountId) || rawAccountId <= 0) {
    throw new Error(
      'NEW_RELIC_ACCOUNT_ID must be a positive integer account id.',
    );
  }

  return {
    accountId: rawAccountId,
    apiUrl,
    userApiKey,
  };
}

export function getNerdGraphConfig(argv: string[]): NerdGraphConfig {
  return resolveNerdGraphConfig({
    accountId: parseCliFlag(argv, 'account') ?? env.NEW_RELIC_ACCOUNT_ID,
    apiUrl: env.NEW_RELIC_NERDGRAPH_API_URL,
    userApiKey: env.NEW_RELIC_USER_API_KEY,
  });
}

export async function runNrqlQuery(
  config: NerdGraphConfig,
  nrql: string,
): Promise<ResultRow[]> {
  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Key': config.userApiKey,
    },
    body: JSON.stringify({
      query: `
        query RunNrql($accountId: Int!, $nrql: Nrql!) {
          actor {
            account(id: $accountId) {
              nrql(query: $nrql) {
                results
              }
            }
          }
        }
      `,
      variables: {
        accountId: config.accountId,
        nrql,
      },
    }),
  });

  const payload = (await response.json()) as NerdGraphResponse<NrqlEnvelope>;

  if (!response.ok) {
    const errorMessage =
      payload.errors?.map((error) => error.message).join('; ') ||
      `HTTP ${response.status}`;
    throw new Error(`New Relic NerdGraph request failed: ${errorMessage}`);
  }

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(
      `New Relic NerdGraph returned errors: ${payload.errors.map((error) => error.message).join('; ')}`,
    );
  }

  return payload.data?.actor?.account?.nrql?.results ?? [];
}

export function printResultRows(
  rows: ResultRow[],
  format: 'json' | 'table',
): void {
  if (format === 'json') {
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
    return;
  }

  if (rows.length === 0) {
    console.log('No rows returned.');
    return;
  }

  console.table(rows);
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

export function getNumericValue(
  row: ResultRow | undefined,
  preferredKeys: string[],
): number | undefined {
  if (!row) return undefined;

  for (const [key, value] of Object.entries(row)) {
    if (
      preferredKeys.includes(key) &&
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      return value;
    }
  }

  for (const value of Object.values(row)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}
