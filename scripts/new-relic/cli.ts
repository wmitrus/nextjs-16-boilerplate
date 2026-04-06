import '../load-env-files';

import {
  getBundle,
  getPreset,
  hasBundle,
  hasPreset,
  listBundleRows,
  listPresetRows,
  resolveBundlePresets,
} from './catalog';
import { buildCompactBundleResult, type ExecutedQueryResult } from './compact';
import {
  formatError,
  getNerdGraphConfig,
  parseOutputFormat,
  parsePositionalArgs,
  parseView,
  printResultRows,
  runNrqlQuery,
} from './lib';

interface BundleExecutionResult {
  kind: 'bundle';
  id: string;
  title: string;
  description: string;
  queries: Array<{
    id: string;
    title: string;
    category: string;
    description: string;
    nrql: string;
    rows: Record<string, unknown>[];
  }>;
}

interface PresetExecutionResult {
  kind: 'preset';
  id: string;
  title: string;
  category: string;
  description: string;
  nrql: string;
  rows: Record<string, unknown>[];
}

function printCompactBundle(
  result: ReturnType<typeof buildCompactBundleResult>,
): void {
  console.log(`${result.title} (${result.id})`);
  console.log(result.description);
  console.log('');
  console.log('Summary');
  console.table([result.summary]);

  if (result.highlights.topErrorClasses.length > 0) {
    console.log('Top Error Classes');
    console.table(result.highlights.topErrorClasses);
  }

  if (result.highlights.slowestTransactions.length > 0) {
    console.log('Slowest Transactions');
    console.table(result.highlights.slowestTransactions);
  }

  if (result.highlights.logLevels.length > 0) {
    console.log('Log Levels');
    console.table(result.highlights.logLevels);
  }
}

function printHelp(): void {
  console.log('New Relic query catalog');
  console.log('');
  console.log('Usage:');
  console.log('  pnpm nr -- list');
  console.log('  pnpm nr -- run <preset-or-bundle-id>');
  console.log('  pnpm nr -- run baseline --view=compact');
  console.log(
    '  pnpm nr:query -- "SELECT count(*) FROM Transaction SINCE 1 hour ago"',
  );
  console.log('');
  console.log('Examples:');
  console.log('  pnpm nr -- run baseline');
  console.log('  pnpm nr -- run baseline --view=compact');
  console.log('  pnpm nr -- run golden-signals --format=json');
  console.log('  pnpm nr -- run throughput.rate');
}

function printCatalog(format: 'json' | 'table'): void {
  const bundles = listBundleRows();
  const presets = listPresetRows();

  if (format === 'json') {
    process.stdout.write(
      JSON.stringify(
        {
          bundles,
          presets,
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  console.log('Bundles');
  console.table(bundles);
  console.log('Presets');
  console.table(presets);
}

async function runPreset(
  config: ReturnType<typeof getNerdGraphConfig>,
  id: string,
  format: 'json' | 'table',
): Promise<void> {
  const preset = getPreset(id);
  const rows = await runNrqlQuery(config, preset.nrql);

  const result: PresetExecutionResult = {
    kind: 'preset',
    id: preset.id,
    title: preset.title,
    category: preset.category,
    description: preset.description,
    nrql: preset.nrql,
    rows,
  };

  console.error(`[nr] account=${config.accountId}`);
  console.error(`[nr] preset=${preset.id}`);

  if (format === 'json') {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  console.log(`${preset.title} (${preset.id})`);
  console.log(preset.description);
  printResultRows(rows, 'table');
}

async function runBundle(
  config: ReturnType<typeof getNerdGraphConfig>,
  id: string,
  format: 'json' | 'table',
  view: 'full' | 'compact',
): Promise<void> {
  const bundle = getBundle(id);
  const presets = resolveBundlePresets(bundle);
  const queryResults: ExecutedQueryResult[] = await Promise.all(
    presets.map(async (preset) => ({
      id: preset.id,
      title: preset.title,
      category: preset.category,
      description: preset.description,
      nrql: preset.nrql,
      rows: await runNrqlQuery(config, preset.nrql),
    })),
  );

  const result: BundleExecutionResult = {
    kind: 'bundle',
    id: bundle.id,
    title: bundle.title,
    description: bundle.description,
    queries: queryResults,
  };

  console.error(`[nr] account=${config.accountId}`);
  console.error(`[nr] bundle=${bundle.id}`);

  if (view === 'compact') {
    const compactResult = buildCompactBundleResult({
      id: bundle.id,
      title: bundle.title,
      description: bundle.description,
      queryResults,
    });

    if (format === 'json') {
      process.stdout.write(JSON.stringify(compactResult, null, 2) + '\n');
      return;
    }

    printCompactBundle(compactResult);
    return;
  }

  if (format === 'json') {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  console.log(`${bundle.title} (${bundle.id})`);
  console.log(bundle.description);

  for (const queryResult of queryResults) {
    console.log('');
    console.log(`${queryResult.title} (${queryResult.id})`);
    console.log(queryResult.description);
    printResultRows(queryResult.rows, 'table');
  }
}

export async function run(argv = process.argv): Promise<void> {
  const positional = parsePositionalArgs(argv);
  const format = parseOutputFormat(argv);
  const view = parseView(argv);
  const command = positional[0];

  if (!command || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'list') {
    printCatalog(format);
    return;
  }

  if (command !== 'run') {
    throw new Error(
      `Unknown command "${command}". Use \`list\`, \`run\`, or \`help\`.`,
    );
  }

  const target = positional[1];

  if (!target) {
    throw new Error(
      'Missing preset or bundle id. Example: `pnpm nr -- run baseline`.',
    );
  }

  const config = getNerdGraphConfig(argv);

  if (hasBundle(target)) {
    await runBundle(config, target, format, view);
    return;
  }

  if (hasPreset(target)) {
    await runPreset(config, target, format);
    return;
  }

  throw new Error(
    `Unknown preset or bundle "${target}". Run \`pnpm nr -- list\` to see the catalog.`,
  );
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('/cli.ts') ||
    process.argv[1].endsWith('/cli.js') ||
    process.argv[1].endsWith('/cli'));

if (isMain) {
  run().catch((error: unknown) => {
    console.error(`[nr] Fatal error: ${formatError(error)}`);
    process.exit(1);
  });
}
