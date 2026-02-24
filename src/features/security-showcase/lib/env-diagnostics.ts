type EnvValue = string | undefined;

export interface EnvDiagnosticsEntry {
  name: string;
  present: boolean;
  maskedValue: string | null;
}

export interface EnvPairIssue {
  pair: [string, string];
  issue: string;
}

export interface EnvConditionalIssue {
  condition: string;
  missing: string[];
  issue: string;
}

export interface EnvDiagnostics {
  ok: boolean;
  environment: string;
  required: EnvDiagnosticsEntry[];
  pairIssues: EnvPairIssue[];
  conditionalIssues: EnvConditionalIssue[];
  suggestions: string[];
}

function getEnv(name: string): EnvValue {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function maskValue(value: EnvValue): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return `${'*'.repeat(Math.max(0, value.length - 2))}${value.slice(-2)}`;
  }

  return `${value.slice(0, 2)}***${value.slice(-4)}`;
}

function summarize(name: string): EnvDiagnosticsEntry {
  const value = getEnv(name);

  return {
    name,
    present: Boolean(value),
    maskedValue: maskValue(value),
  };
}

export function getEnvDiagnostics(): EnvDiagnostics {
  const required = [
    'CLERK_SECRET_KEY',
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'INTERNAL_API_KEY',
  ];

  const optionalPairs = [
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  ] as const;

  const requiredSummary = required.map(summarize);
  const missingRequired = requiredSummary
    .filter((entry) => !entry.present)
    .map((entry) => entry.name);

  const pairIssues: EnvPairIssue[] = optionalPairs
    .map<EnvPairIssue | null>(([left, right]) => {
      const leftValue = getEnv(left);
      const rightValue = getEnv(right);
      const partiallyConfigured =
        (Boolean(leftValue) && !rightValue) ||
        (!leftValue && Boolean(rightValue));

      if (!partiallyConfigured) {
        return null;
      }

      return {
        pair: [left, right],
        issue: 'Only one variable in the pair is set.',
      };
    })
    .filter((issue): issue is EnvPairIssue => issue !== null);

  const logflareServerEnabled = getEnv('LOGFLARE_SERVER_ENABLED') === 'true';
  const logflareEdgeEnabled = getEnv('LOGFLARE_EDGE_ENABLED') === 'true';

  const conditionalIssues: EnvConditionalIssue[] = [];

  if (logflareServerEnabled) {
    const missing: string[] = [];

    if (!getEnv('LOGFLARE_API_KEY')) {
      missing.push('LOGFLARE_API_KEY');
    }

    if (!getEnv('LOGFLARE_SOURCE_TOKEN') && !getEnv('LOGFLARE_SOURCE_NAME')) {
      missing.push('LOGFLARE_SOURCE_TOKEN or LOGFLARE_SOURCE_NAME');
    }

    if (missing.length > 0) {
      conditionalIssues.push({
        condition: 'LOGFLARE_SERVER_ENABLED=true',
        missing,
        issue:
          'Server Logflare transport is enabled but required credentials are missing.',
      });
    }
  }

  if (logflareEdgeEnabled && !getEnv('NEXT_PUBLIC_APP_URL')) {
    conditionalIssues.push({
      condition: 'LOGFLARE_EDGE_ENABLED=true',
      missing: ['NEXT_PUBLIC_APP_URL'],
      issue: 'Edge log shipping is enabled but NEXT_PUBLIC_APP_URL is missing.',
    });
  }

  return {
    ok:
      missingRequired.length === 0 &&
      pairIssues.length === 0 &&
      conditionalIssues.length === 0,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    required: requiredSummary,
    pairIssues,
    conditionalIssues,
    suggestions: [
      'Set all required keys for this deployment target.',
      'If using Upstash, set both URL and TOKEN or unset both.',
      'If LOGFLARE_SERVER_ENABLED=true, set LOGFLARE_API_KEY and SOURCE_TOKEN or SOURCE_NAME.',
      'If LOGFLARE_EDGE_ENABLED=true, set NEXT_PUBLIC_APP_URL to your deployment URL.',
      'Keep INTERNAL_API_KEY aligned with any internal clients/tests.',
    ],
  };
}
