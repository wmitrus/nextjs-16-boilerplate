import '../load-env-files';

import {
  extractNrqlFromArgv,
  formatError,
  getNerdGraphConfig,
  parseOutputFormat,
  printResultRows,
  runNrqlQuery,
} from './lib';

export async function run(argv = process.argv): Promise<void> {
  const config = getNerdGraphConfig(argv);
  const nrql = extractNrqlFromArgv(argv);
  const format = parseOutputFormat(argv);

  const rows = await runNrqlQuery(config, nrql);

  console.error(`[nr:query] account=${config.accountId}`);
  console.error(`[nr:query] nrql=${nrql}`);
  printResultRows(rows, format);
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('/query.ts') ||
    process.argv[1].endsWith('/query.js') ||
    process.argv[1].endsWith('/query'));

if (isMain) {
  run().catch((error: unknown) => {
    console.error(`[nr:query] Fatal error: ${formatError(error)}`);
    process.exit(1);
  });
}
