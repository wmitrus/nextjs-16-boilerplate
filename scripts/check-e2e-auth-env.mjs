import fs from 'node:fs';
import path from 'node:path';

const required = ['E2E_CLERK_USER_USERNAME', 'E2E_CLERK_USER_PASSWORD'];

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

const missing = required.filter((key) => {
  const value = process.env[key] ?? envLocal[key] ?? envFile[key];
  return !value || value.trim().length === 0;
});

if (missing.length > 0) {
  console.error(
    `❌ Missing E2E auth vars: ${missing.join(', ')}. Set them in .env.local to run Clerk-authenticated E2E tests.`,
  );
  process.exit(1);
}

console.log('✅ E2E auth vars are set');
