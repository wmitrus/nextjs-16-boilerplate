import * as fs from 'fs';
import * as path from 'path';

export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    if (!key) continue;

    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const commentIdx = value.indexOf(' #');
      if (commentIdx !== -1) {
        value = value.slice(0, commentIdx).trim();
      }
    }

    result[key] = value;
  }

  return result;
}

const envFile = path.resolve(process.cwd(), '.env.local');

try {
  const content = fs.readFileSync(envFile, 'utf8');
  const parsed = parseEnvFile(content);

  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in process.env)) {
      // eslint-disable-next-line security/detect-object-injection
      process.env[key] = value;
    }
  }
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw err;
  }
}
