import '../load-env-files';

import {
  formatError,
  getLeantimeConfig,
  parseCliFlag,
  parseOutputFormat,
  printValue,
  readStructuredInput,
  runLeantimeRpc,
} from './lib';

function getMethod(argv: string[]): string {
  const method = parseCliFlag(argv, 'method');

  if (!method) {
    throw new Error(
      'Missing --method. Example: `pnpm lt:rpc -- --method leantime.rpc.Tickets.Tickets.getTicket --input \'{"id":9}\'`.',
    );
  }

  return method;
}

export async function run(argv = process.argv): Promise<void> {
  const config = getLeantimeConfig(argv);
  const method = getMethod(argv);
  const params = readStructuredInput(argv);
  const format = parseOutputFormat(argv);
  const result = await runLeantimeRpc(config, method, params);

  console.error(`[lt:rpc] rpc=${config.rpcUrl}`);
  console.error(`[lt:rpc] method=${method}`);
  printValue(result, format);
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('/rpc.ts') ||
    process.argv[1].endsWith('/rpc.js') ||
    process.argv[1].endsWith('/rpc'));

if (isMain) {
  run().catch((error: unknown) => {
    console.error(`[lt:rpc] Fatal error: ${formatError(error)}`);
    process.exit(1);
  });
}
