import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export function getMissingKeys(envTsContent, exampleContent) {
  // Extract server and client blocks
  const serverBlockMatch = envTsContent.match(/server:\s*{([\s\S]*?)}/);
  const clientBlockMatch = envTsContent.match(/client:\s*{([\s\S]*?)}/);

  const extractKeys = (block) => {
    if (!block) return [];
    // Match keys at the start of a line with optional whitespace, followed by a colon.
    // It must NOT be preceded by // (comments).
    const keyRegex = /^[ \t]*(?!\/\/)\s*(\w+):/gm;
    return [...block.matchAll(keyRegex)].map((m) => m[1]);
  };

  const serverKeys = extractKeys(serverBlockMatch?.[1]);
  const clientKeys = extractKeys(clientBlockMatch?.[1]);

  const allKeys = [...new Set([...serverKeys, ...clientKeys])];
  return allKeys.filter((key) => !exampleContent.includes(`${key}=`));
}

function checkEnvConsistency() {
  const envTsPath = path.join(ROOT, 'src/core/env.ts');
  const examplePath = path.join(ROOT, '.env.example');

  if (!fs.existsSync(envTsPath) || !fs.existsSync(examplePath)) {
    console.error('❌ Missing src/core/env.ts or .env.example');
    process.exit(1);
  }

  const envTsContent = fs.readFileSync(envTsPath, 'utf8');
  const exampleContent = fs.readFileSync(examplePath, 'utf8');

  const missingKeys = getMissingKeys(envTsContent, exampleContent);

  if (missingKeys.length > 0) {
    console.error(`❌ Missing keys in .env.example: ${missingKeys.join(', ')}`);
    process.exit(1);
  }

  console.log('✅ .env.example is in sync with src/core/env.ts');
}

// Only run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkEnvConsistency();
}
