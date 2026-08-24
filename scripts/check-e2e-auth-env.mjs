import { fileURLToPath } from 'node:url';

import { createClerkClient } from '@clerk/backend';

import { checkClerkRedirectUrls } from './check-env-consistency.mjs';
import {
  applyEnv,
  loadScenarioEnv,
  SCENARIO_NAMES,
  VARIANT_NAMES,
} from './e2e/load-env.mjs';

function parseArgs(argv) {
  let scenario;
  let variant;
  let withOauth = false;

  const values = argv[Symbol.iterator]();

  for (const value of values) {
    if (value === '--scenario') {
      const nextValue = values.next().value;
      if (!nextValue || !SCENARIO_NAMES.includes(nextValue)) {
        throw new Error(
          `Missing or invalid scenario. Expected one of: ${SCENARIO_NAMES.join(', ')}`,
        );
      }
      scenario = nextValue;
      continue;
    }

    if (value === '--variant') {
      const nextValue = values.next().value;
      if (!nextValue || !VARIANT_NAMES.includes(nextValue)) {
        throw new Error(
          `Missing or invalid variant. Expected one of: ${VARIANT_NAMES.join(', ')}`,
        );
      }
      variant = nextValue;
      continue;
    }

    if (value === '--with-oauth') {
      withOauth = true;
    }
  }

  return {
    scenario,
    variant,
    withOauth,
  };
}

function getEnvValue(key) {
  for (const [envKey, envValue] of Object.entries(process.env)) {
    if (envKey !== key) {
      continue;
    }

    return envValue && envValue.trim().length > 0 ? envValue : undefined;
  }

  return undefined;
}

const BASE_REQUIREMENTS = [
  {
    label: 'Clerk secret key',
    key: 'CLERK_SECRET_KEY',
  },
  {
    label: 'Clerk publishable key',
    key: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  },
];

const REQUIRED_GROUPS = {
  singleProvisionedUser: {
    label: 'single provisioned user',
    username: [
      'E2E_CLERK_SINGLE_PROVISIONED_USER_USERNAME',
      'E2E_CLERK_USER_USERNAME',
    ],
    password: [
      'E2E_CLERK_SINGLE_PROVISIONED_USER_PASSWORD',
      'E2E_CLERK_USER_PASSWORD',
    ],
  },
  singleNewUser: {
    label: 'single new user',
    username: [
      'E2E_CLERK_SINGLE_NEW_USER_USERNAME',
      'E2E_CLERK_UNPROVISIONED_USER_USERNAME',
    ],
    password: [
      'E2E_CLERK_SINGLE_NEW_USER_PASSWORD',
      'E2E_CLERK_UNPROVISIONED_USER_PASSWORD',
    ],
  },
  personalNewUser: {
    label: 'personal new user',
    username: ['E2E_CLERK_PERSONAL_NEW_USER_USERNAME'],
    password: ['E2E_CLERK_PERSONAL_NEW_USER_PASSWORD'],
  },
  orgProviderOwner: {
    label: 'org/provider owner user',
    username: ['E2E_CLERK_ORG_PROVIDER_OWNER_USERNAME'],
    password: ['E2E_CLERK_ORG_PROVIDER_OWNER_PASSWORD'],
  },
  orgProviderMember: {
    label: 'org/provider member user',
    username: ['E2E_CLERK_ORG_PROVIDER_MEMBER_USERNAME'],
    password: ['E2E_CLERK_ORG_PROVIDER_MEMBER_PASSWORD'],
  },
  orgDbSeededMember: {
    label: 'org/db seeded member user',
    username: ['E2E_CLERK_ORG_DB_SEEDED_MEMBER_USERNAME'],
    password: ['E2E_CLERK_ORG_DB_SEEDED_MEMBER_PASSWORD'],
  },
  linkingBlockedUnverified: {
    label: 'link-blocked unverified user',
    username: ['E2E_CLERK_LINK_BLOCKED_UNVERIFIED_USERNAME'],
    password: ['E2E_CLERK_LINK_BLOCKED_UNVERIFIED_PASSWORD'],
  },
};

const REQUIRED_ORGS = {
  orgProviderOwner: {
    label: 'org/provider owner organization slug',
    key: 'E2E_CLERK_ORG_PROVIDER_OWNER_SLUG',
  },
  orgProviderMember: {
    label: 'org/provider member organization slug',
    key: 'E2E_CLERK_ORG_PROVIDER_MEMBER_SLUG',
  },
};

const AUTO_RECONCILED_GROUPS = new Set([
  'singleProvisionedUser',
  'singleNewUser',
  'incompleteUser',
  'personalNewUser',
  'orgProviderOwner',
  'orgProviderMember',
  'orgDbSeededMember',
]);

const CLERK_LOOKUP_MAX_ATTEMPTS = 3;
const CLERK_LOOKUP_RETRY_DELAY_MS = 750;

function findRecordByKey(record, key) {
  for (const [entryKey, entryValue] of Object.entries(record)) {
    if (entryKey === key) {
      return entryValue;
    }
  }

  return undefined;
}

function getRequiredGroup(groupName) {
  const group = findRecordByKey(REQUIRED_GROUPS, groupName);
  if (!group) {
    throw new Error(`Unsupported requirement group: ${groupName}`);
  }

  return group;
}

function getRequiredOrg(orgName) {
  const organization = findRecordByKey(REQUIRED_ORGS, orgName);
  if (!organization) {
    throw new Error(`Unsupported organization requirement: ${orgName}`);
  }

  return organization;
}

function resolveAlias(keys) {
  for (const key of keys) {
    const value = getEnvValue(key);
    if (value) {
      return { key, value };
    }
  }

  return null;
}

function looksLikeEmailAddress(value) {
  return typeof value === 'string' && value.includes('@');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeUnknownError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details = [];
  const maybeApiError = error;

  if (error.name) {
    details.push(error.name);
  }

  if (error.message) {
    details.push(error.message);
  }

  if (typeof maybeApiError.status === 'number') {
    details.push(`status=${maybeApiError.status}`);
  }

  if (typeof maybeApiError.statusCode === 'number') {
    details.push(`statusCode=${maybeApiError.statusCode}`);
  }

  if (Array.isArray(maybeApiError.errors)) {
    const clerkErrors = maybeApiError.errors
      .map((entry) => {
        const code = typeof entry?.code === 'string' ? entry.code : undefined;
        const message =
          typeof entry?.message === 'string' ? entry.message : undefined;

        return [code, message].filter(Boolean).join(': ');
      })
      .filter(Boolean);

    if (clerkErrors.length > 0) {
      details.push(clerkErrors.join('; '));
    }
  }

  return details.length > 0 ? details.join(' - ') : 'unknown error';
}

function createClerkFixtureLookup() {
  const secretKey = getEnvValue('CLERK_SECRET_KEY');

  if (!secretKey) {
    throw new Error(
      'CLERK_SECRET_KEY is required to validate Clerk fixture accounts.',
    );
  }

  const apiUrl = getEnvValue('CLERK_API_URL');
  const clerkClient = createClerkClient(
    apiUrl ? { secretKey, apiUrl } : { secretKey },
  );

  return async (emailAddress) => {
    let lastError;

    for (let attempt = 1; attempt <= CLERK_LOOKUP_MAX_ATTEMPTS; attempt += 1) {
      try {
        const userList = await clerkClient.users.getUserList({
          emailAddress: [emailAddress],
        });

        return Array.isArray(userList.data) && userList.data.length > 0;
      } catch (error) {
        lastError = error;
        if (attempt < CLERK_LOOKUP_MAX_ATTEMPTS) {
          await sleep(CLERK_LOOKUP_RETRY_DELAY_MS);
        }
      }
    }

    throw new Error(describeUnknownError(lastError));
  };
}

export async function findMissingClerkFixtureAccounts(fixtures, fixtureExists) {
  const missing = [];
  const warnings = [];

  for (const fixture of fixtures) {
    if (!looksLikeEmailAddress(fixture.identifierValue)) {
      continue;
    }

    const exists = await fixtureExists(fixture.identifierValue);
    if (exists) {
      continue;
    }

    const message = `${fixture.label}: ${fixture.identifierKey}=${fixture.identifierValue} is set locally but no Clerk user with that email exists in the current Clerk instance`;

    if (fixture.autoReconciled === true) {
      warnings.push(
        `${message}. The E2E Clerk helper will create or repair this mutable fixture automatically before sign-in.`,
      );
      continue;
    }

    missing.push(message);
  }

  return { missing, warnings };
}

function collectRequirements({ scenario, variant, withOauth }) {
  const groups = new Set();
  const orgs = new Set();

  switch (scenario) {
    case 'single':
      groups.add('singleProvisionedUser');
      groups.add('singleNewUser');
      break;
    case 'personal':
      groups.add('personalNewUser');
      break;
    case 'org-provider':
      groups.add('orgProviderOwner');
      orgs.add('orgProviderOwner');
      break;
    case 'org-db':
      groups.add('orgDbSeededMember');
      break;
    default:
      groups.add('singleProvisionedUser');
      groups.add('singleNewUser');
      groups.add('personalNewUser');
      groups.add('orgProviderOwner');
      groups.add('orgDbSeededMember');
      orgs.add('orgProviderOwner');
      break;
  }

  if (variant === 'single-linking-disabled') {
    groups.add('linkingBlockedUnverified');
  }

  if (withOauth) {
    // Provider name only; external IdP credentials are provider-specific and documented separately.
    orgs.add('oauthProvider');
  }

  return { groups, orgs };
}

function validateSeededEmailAssumptions({ scenario, variant }, missing) {
  if (scenario === 'org-db') {
    const username = getEnvValue('E2E_CLERK_ORG_DB_SEEDED_MEMBER_USERNAME');
    if (username && username !== 'bob@example.com') {
      missing.push(
        'org/db seeded member email must currently be bob@example.com to map to the seeded Acme member record',
      );
    }
  }

  if (variant === 'single-linking-disabled') {
    const username = getEnvValue('E2E_CLERK_LINK_BLOCKED_UNVERIFIED_USERNAME');
    if (username && username !== 'alice@example.com') {
      missing.push(
        'single-linking-disabled fixture email must currently be alice@example.com to collide with the seeded internal user',
      );
    }
  }
}

function collectOptionalWarnings() {
  const warnings = [];
  const incompleteUsername = getEnvValue('E2E_CLERK_INCOMPLETE_USER_USERNAME');
  const incompletePassword = getEnvValue('E2E_CLERK_INCOMPLETE_USER_PASSWORD');

  if (
    (incompleteUsername && !incompletePassword) ||
    (!incompleteUsername && incompletePassword)
  ) {
    warnings.push(
      'optional incomplete-user identity is only partially configured; set both E2E_CLERK_INCOMPLETE_USER_USERNAME and E2E_CLERK_INCOMPLETE_USER_PASSWORD when using AF-06 / AF-07 rerunnable auth-regression checks',
    );
  }

  return warnings;
}

export function validateClerkRedirectEnv(
  effectiveEnv,
  nodeEnv = 'development',
) {
  const { warnings } = checkClerkRedirectUrls(effectiveEnv, nodeEnv);

  return warnings.map(
    (warning) =>
      `Clerk redirect env drift detected: ${warning.trim()}. Expected all sign-in/sign-up redirect URLs to use /auth/bootstrap/start?redirect_url=/users for auth-matrix runs.`,
  );
}

/**
 * Everything this script validates is a Clerk fixture: test identities, Clerk
 * redirect URLs, Clerk API keys. A run whose app is configured for a different
 * auth provider never touches any of it -- the Clerk-specific specs gate
 * themselves on `runtime-profile.ts`'s `authProvider === 'clerk'` -- so
 * demanding live Clerk credentials there is a false requirement.
 *
 * It was a real blocker rather than a cosmetic one: it made every
 * `AUTH_PROVIDER=authjs` suite (`e2e:authjs:core`, `e2e:admin:audit-logs`,
 * `e2e:demo-showcase`, `e2e:admin:step-up`) unrunnable in CI without Clerk
 * test-account secrets they never use. `e2e-audit-log.yml` already carried a
 * comment naming this as a pre-existing gap.
 */
export function requiresClerkFixtures(authProvider) {
  // Unset means the app's own default, which is Clerk.
  return (authProvider ?? 'clerk').trim() === 'clerk';
}

export async function main() {
  const { scenario, variant, withOauth } = parseArgs(process.argv.slice(2));

  const loadedEnv = loadScenarioEnv({
    scenario,
    variant,
    includeLocal: true,
  });
  applyEnv({
    ...loadedEnv,
    ...process.env,
  });

  if (!requiresClerkFixtures(process.env.AUTH_PROVIDER)) {
    console.log(
      `✅ Skipping Clerk E2E fixture validation: AUTH_PROVIDER=${process.env.AUTH_PROVIDER} ` +
        'does not use Clerk identities.',
    );
    return;
  }

  const missing = [];
  const aliasWarnings = [];
  const optionalWarnings = collectOptionalWarnings();
  const requiredFixtures = [];
  const redirectEnvErrors = validateClerkRedirectEnv(
    process.env,
    process.env.NODE_ENV,
  );

  for (const requirement of BASE_REQUIREMENTS) {
    if (!getEnvValue(requirement.key)) {
      missing.push(`${requirement.label}: ${requirement.key}`);
    }
  }

  const { groups, orgs } = collectRequirements({
    scenario,
    variant,
    withOauth,
  });

  for (const groupName of groups) {
    const group = getRequiredGroup(groupName);
    const username = resolveAlias(group.username);
    const password = resolveAlias(group.password);

    if (!username || !password) {
      missing.push(
        `${group.label}: ${group.username[0]}, ${group.password[0]}`,
      );
      continue;
    }

    if (group.username.length > 1 && username.key !== group.username[0]) {
      aliasWarnings.push(
        `${group.label} username uses legacy alias ${username.key}; migrate to ${group.username[0]}`,
      );
    }

    if (group.password.length > 1 && password.key !== group.password[0]) {
      aliasWarnings.push(
        `${group.label} password uses legacy alias ${password.key}; migrate to ${group.password[0]}`,
      );
    }

    requiredFixtures.push({
      label: group.label,
      identifierKey: username.key,
      identifierValue: username.value,
      autoReconciled: AUTO_RECONCILED_GROUPS.has(groupName),
    });
  }

  for (const orgName of orgs) {
    if (orgName === 'oauthProvider') {
      if (!getEnvValue('E2E_CLERK_OAUTH_PROVIDER')) {
        missing.push('OAuth provider name: E2E_CLERK_OAUTH_PROVIDER');
      }
      continue;
    }

    const organization = getRequiredOrg(orgName);
    if (!getEnvValue(organization.key)) {
      missing.push(`${organization.label}: ${organization.key}`);
    }
  }

  validateSeededEmailAssumptions({ scenario, variant }, missing);

  if (redirectEnvErrors.length > 0) {
    missing.push(...redirectEnvErrors);
  }

  if (missing.length === 0) {
    try {
      const fixtureExists = createClerkFixtureLookup();
      const fixtureAccountStatus = await findMissingClerkFixtureAccounts(
        requiredFixtures,
        fixtureExists,
      );

      if (fixtureAccountStatus.missing.length > 0) {
        missing.push(...fixtureAccountStatus.missing);
      }

      if (fixtureAccountStatus.warnings.length > 0) {
        optionalWarnings.push(...fixtureAccountStatus.warnings);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'unknown Clerk lookup failure';
      missing.push(
        `Unable to verify Clerk fixture accounts against the current Clerk instance: ${errorMessage}`,
      );
    }
  }

  if (missing.length > 0) {
    console.error(
      `❌ Missing or invalid E2E Clerk fixture vars:\n- ${missing.join(
        '\n- ',
      )}\nSet them in .env.e2e.local (preferred), .env.e2e, or export them in the shell before running the scenario.`,
    );
    process.exit(1);
  }

  if (aliasWarnings.length > 0) {
    console.warn(
      `⚠️ Legacy Clerk E2E aliases detected:\n- ${aliasWarnings.join('\n- ')}`,
    );
  }

  if (optionalWarnings.length > 0) {
    console.warn(
      `⚠️ Optional Clerk E2E setup notes:\n- ${optionalWarnings.join('\n- ')}`,
    );
  }

  console.log('✅ Clerk E2E fixture vars are set');
}

// Only run main() if this file is executed directly via `node`, not when imported
const isDirectlyExecuted = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectlyExecuted && typeof process.env.VITEST === 'undefined') {
  main().catch((error) => {
    const errorMessage =
      error instanceof Error ? error.message : 'unknown E2E auth env failure';
    console.error(`❌ Failed to validate Clerk E2E env: ${errorMessage}`);
    process.exit(1);
  });
}
