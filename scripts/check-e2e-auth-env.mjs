import fs from 'node:fs';
import path from 'node:path';

const requiredGroups = [
  {
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
  {
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
  {
    label: 'personal new user',
    username: ['E2E_CLERK_PERSONAL_NEW_USER_USERNAME'],
    password: ['E2E_CLERK_PERSONAL_NEW_USER_PASSWORD'],
  },
  {
    label: 'org owner user',
    username: ['E2E_CLERK_ORG_OWNER_USERNAME'],
    password: ['E2E_CLERK_ORG_OWNER_PASSWORD'],
  },
  {
    label: 'org member user',
    username: ['E2E_CLERK_ORG_MEMBER_USERNAME'],
    password: ['E2E_CLERK_ORG_MEMBER_PASSWORD'],
  },
  {
    label: 'org non-member user',
    username: ['E2E_CLERK_ORG_NON_MEMBER_USERNAME'],
    password: ['E2E_CLERK_ORG_NON_MEMBER_PASSWORD'],
  },
  {
    label: 'unverified email user',
    username: ['E2E_CLERK_UNVERIFIED_EMAIL_USER_USERNAME'],
    password: ['E2E_CLERK_UNVERIFIED_EMAIL_USER_PASSWORD'],
  },
];

const requiredOrganizations = [
  {
    label: 'org owner fixture',
    key: 'E2E_CLERK_ORG_OWNER_SLUG',
  },
  {
    label: 'org member fixture',
    key: 'E2E_CLERK_ORG_MEMBER_SLUG',
  },
  {
    label: 'org empty fixture',
    key: 'E2E_CLERK_ORG_EMPTY_SLUG',
  },
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const entries = {};

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const index = line.indexOf('=');
    if (index === -1) {
      continue;
    }

    const key = line.slice(0, index).trim();
    const value = line
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    entries[key] = value;
  }

  return entries;
}

const envLocal = parseEnvFile(path.resolve(process.cwd(), '.env.local'));
const envFile = parseEnvFile(path.resolve(process.cwd(), '.env'));

function getEnvValue(key) {
  const value = process.env[key] ?? envLocal[key] ?? envFile[key];
  return value && value.trim().length > 0 ? value : undefined;
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

const missing = [];
const aliasWarnings = [];

for (const group of requiredGroups) {
  const username = resolveAlias(group.username);
  const password = resolveAlias(group.password);

  if (!username || !password) {
    missing.push(`${group.label}: ${group.username[0]}, ${group.password[0]}`);
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

for (const organization of requiredOrganizations) {
  if (!getEnvValue(organization.key)) {
    missing.push(`${organization.label}: ${organization.key}`);
  }
}

if (missing.length > 0) {
  console.error(
    `❌ Missing E2E Clerk fixture vars:\n- ${missing.join('\n- ')}\nSet them in .env.local to run the full Clerk E2E matrix.`,
  );
  process.exit(1);
}

if (aliasWarnings.length > 0) {
  console.warn(
    `⚠️ Legacy Clerk E2E aliases detected:\n- ${aliasWarnings.join('\n- ')}`,
  );
}

console.log('✅ Clerk E2E fixture vars are set');
