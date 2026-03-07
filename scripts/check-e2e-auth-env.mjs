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

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--scenario') {
      const nextValue = argv[index + 1];
      if (!nextValue || !SCENARIO_NAMES.includes(nextValue)) {
        throw new Error(
          `Missing or invalid scenario. Expected one of: ${SCENARIO_NAMES.join(', ')}`,
        );
      }
      scenario = nextValue;
      index += 1;
      continue;
    }

    if (value === '--variant') {
      const nextValue = argv[index + 1];
      if (!nextValue || !VARIANT_NAMES.includes(nextValue)) {
        throw new Error(
          `Missing or invalid variant. Expected one of: ${VARIANT_NAMES.join(', ')}`,
        );
      }
      variant = nextValue;
      index += 1;
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
  const value = process.env[key];
  return value && value.trim().length > 0 ? value : undefined;
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

function resolveAlias(keys) {
  for (const key of keys) {
    const value = getEnvValue(key);
    if (value) {
      return { key, value };
    }
  }

  return null;
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

function main() {
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

  const missing = [];
  const aliasWarnings = [];

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
    const group = REQUIRED_GROUPS[groupName];
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
  }

  for (const orgName of orgs) {
    if (orgName === 'oauthProvider') {
      if (!getEnvValue('E2E_CLERK_OAUTH_PROVIDER')) {
        missing.push('OAuth provider name: E2E_CLERK_OAUTH_PROVIDER');
      }
      continue;
    }

    const organization = REQUIRED_ORGS[orgName];
    if (!getEnvValue(organization.key)) {
      missing.push(`${organization.label}: ${organization.key}`);
    }
  }

  validateSeededEmailAssumptions({ scenario, variant }, missing);

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

  console.log('✅ Clerk E2E fixture vars are set');
}

main();
