import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ENV_FILES = {
  example: '.env.example',
  local: '.env.local',
};

function setupEnv() {
  const examplePath = path.join(ROOT, ENV_FILES.example);
  const localPath = path.join(ROOT, ENV_FILES.local);

  if (!fs.existsSync(examplePath)) {
    console.error(`❌ ${ENV_FILES.example} not found.`);
    process.exit(1);
  }

  if (fs.existsSync(localPath)) {
    console.log(`ℹ️ ${ENV_FILES.local} already exists. Skipping.`);
    return;
  }

  try {
    fs.copyFileSync(examplePath, localPath);
    console.log(`✅ Created ${ENV_FILES.local} from ${ENV_FILES.example}.`);
  } catch (error) {
    console.error(`❌ Failed to create ${ENV_FILES.local}:`, error.message);
    process.exit(1);
  }
}

setupEnv();
