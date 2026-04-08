import '../load-env-files';

import { executeOperation, getOperation, listOperationRows } from './catalog';
import {
  formatError,
  getLeantimeConfig,
  parseOutputFormat,
  parsePositionalArgs,
  printValue,
  readStructuredInput,
} from './lib';

function printHelp(): void {
  console.log('Leantime automation catalog');
  console.log('');
  console.log('Usage:');
  console.log('  pnpm lt -- list');
  console.log(
    '  pnpm lt -- run <operation-id> --input-file path/to/input.json',
  );
  console.log(
    '  pnpm lt -- run task.create --input \'{"headline":"Kickoff"}\'',
  );
  console.log(
    '  pnpm lt:rpc -- --method leantime.rpc.Tickets.Tickets.getTicket --input \'{"id":9}\'',
  );
  console.log('');
  console.log('Examples:');
  console.log('  pnpm lt -- run project.create --input-file .tmp/project.json');
  console.log(
    '  pnpm lt -- run initiative.kickoff --input-file .tmp/kickoff.json',
  );
  console.log(
    '  pnpm lt -- run task.patch --input \'{"id":42,"fields":{"status":1}}\'',
  );
  console.log('  pnpm lt -- run time.log --input-file .tmp/time-entry.json');
}

export async function run(argv = process.argv): Promise<void> {
  const positional = parsePositionalArgs(argv);
  const command = positional[0];
  const format = parseOutputFormat(argv);

  if (!command || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'list') {
    printValue(listOperationRows(), format);
    return;
  }

  if (command !== 'run') {
    throw new Error(
      `Unknown command "${command}". Use \`list\`, \`run\`, or \`help\`.`,
    );
  }

  const operationId = positional[1];

  if (!operationId) {
    throw new Error(
      'Missing operation id. Example: `pnpm lt -- run task.create --input-file task.json`.',
    );
  }

  const config = getLeantimeConfig(argv);
  const input = readStructuredInput(argv);
  const operation = getOperation(operationId);
  const result = await executeOperation(operationId, {
    config,
    input,
  });

  console.error(`[lt] rpc=${config.rpcUrl}`);
  console.error(`[lt] operation=${operation.id}`);
  console.log(`${operation.title} (${operation.id})`);
  console.log(operation.description);
  printValue(result, format);
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('/cli.ts') ||
    process.argv[1].endsWith('/cli.js') ||
    process.argv[1].endsWith('/cli'));

if (isMain) {
  run().catch((error: unknown) => {
    console.error(`[lt] Fatal error: ${formatError(error)}`);
    process.exit(1);
  });
}
