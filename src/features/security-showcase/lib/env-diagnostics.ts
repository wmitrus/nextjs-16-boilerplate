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

export interface EnvDiagnostics {
  ok: boolean;
  environment: string;
  required: EnvDiagnosticsEntry[];
  pairIssues: EnvPairIssue[];
  suggestions: string[];
  timestamp: string;
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

  return {
    ok: missingRequired.length === 0 && pairIssues.length === 0,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    required: requiredSummary,
    pairIssues,
    suggestions: [
      'Set all required keys for this deployment target.',
      'If using Upstash, set both URL and TOKEN or unset both.',
      'Keep INTERNAL_API_KEY aligned with any internal clients/tests.',
    ],
    timestamp: new Date().toISOString(),
  };
}
