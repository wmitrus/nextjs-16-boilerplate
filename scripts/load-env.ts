import * as fs from 'fs';
import * as path from 'path';

export function parseEnvFile(content: string): Record<string, string> {
  const entries: Array<[string, string]> = [];

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

    entries.push([key, value]);
  }

  return Object.fromEntries(entries) as Record<string, string>;
}

try {
  const content = fs.readFileSync(
    path.resolve(process.cwd(), '.env.local'),
    'utf8',
  );
  const parsed = parseEnvFile(content);
  const pendingEntries: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in process.env)) {
      pendingEntries.push([key, value]);
    }
  }

  Object.assign(process.env, Object.fromEntries(pendingEntries));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw err;
  }
}
