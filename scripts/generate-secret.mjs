#!/usr/bin/env node
import crypto from 'node:crypto';

const ALLOWED_LENGTHS = new Set([32, 48, 64]);

function parseLength(args) {
  const lengthFlagIndex = args.findIndex(
    (arg) => arg === '--length' || arg === '-l',
  );
  if (lengthFlagIndex === -1) {
    return 64;
  }

  const rawValue = args[lengthFlagIndex + 1];
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid length: ${rawValue ?? '(missing)'}`);
  }

  if (!ALLOWED_LENGTHS.has(parsed)) {
    throw new Error(`Invalid length: ${parsed}. Allowed values: 32, 48, 64.`);
  }

  return parsed;
}

function randomBase64Url(length) {
  let output = '';
  while (output.length < length) {
    output += crypto.randomBytes(32).toString('base64url');
  }
  return output.slice(0, length);
}

try {
  const length = parseLength(process.argv.slice(2));
  const secret = randomBase64Url(length);
  process.stdout.write(`${secret}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.stderr.write(
    'Usage: node scripts/generate-secret.mjs --length 32|48|64\n',
  );
  process.exit(1);
}
