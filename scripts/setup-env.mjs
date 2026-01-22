import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ENV_FILES = {
  example: '.env.example',
  local: '.env.local',
};

export function performSetup(fsInterface = fs) {
  const examplePath = path.join(ROOT, ENV_FILES.example);
  const localPath = path.join(ROOT, ENV_FILES.local);

  if (!fsInterface.existsSync(examplePath)) {
    return { success: false, message: `${ENV_FILES.example} not found.` };
  }

  if (fsInterface.existsSync(localPath)) {
    return {
      success: true,
      message: `${ENV_FILES.local} already exists. Skipping.`,
    };
  }

  try {
    fsInterface.copyFileSync(examplePath, localPath);
    return {
      success: true,
      message: `Created ${ENV_FILES.local} from ${ENV_FILES.example}.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to create ${ENV_FILES.local}: ${error.message}`,
    };
  }
}

function setupEnv() {
  const result = performSetup();
  if (result.success) {
    console.log(`✅ ${result.message}`);
  } else {
    console.error(`❌ ${result.message}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  setupEnv();
}
