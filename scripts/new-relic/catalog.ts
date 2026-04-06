export interface NrqlPreset {
  id: string;
  title: string;
  category: 'signal' | 'trend' | 'breakdown' | 'advanced';
  description: string;
  nrql: string;
}

export interface NrqlBundle {
  id: string;
  title: string;
  description: string;
  presetIds: string[];
}

export const NRQL_PRESETS: NrqlPreset[] = [
  {
    id: 'throughput.count',
    title: 'Throughput Snapshot',
    category: 'signal',
    description: 'Transaction count over the last hour.',
    nrql: 'SELECT count(*) AS transactionCount FROM Transaction SINCE 1 hour ago',
  },
  {
    id: 'throughput.rate',
    title: 'Throughput Trend',
    category: 'trend',
    description: 'Per-minute transaction rate over the last hour.',
    nrql: 'SELECT rate(count(*), 1 minute) AS throughputPerMinute FROM Transaction TIMESERIES SINCE 1 hour ago',
  },
  {
    id: 'latency.summary',
    title: 'Latency Summary',
    category: 'signal',
    description: 'Average plus p50, p95, and p99 latency over the last hour.',
    nrql: 'SELECT average(duration) AS avgDurationSeconds, percentile(duration, 50, 95, 99) FROM Transaction SINCE 1 hour ago',
  },
  {
    id: 'latency.timeseries',
    title: 'Latency Trend',
    category: 'trend',
    description: 'Average transaction duration over time.',
    nrql: 'SELECT average(duration) AS avgDurationSeconds FROM Transaction TIMESERIES SINCE 1 hour ago',
  },
  {
    id: 'errors.count',
    title: 'Error Volume Snapshot',
    category: 'signal',
    description: 'Total transaction errors over the last hour.',
    nrql: 'SELECT count(*) AS errorCount FROM TransactionError SINCE 1 hour ago',
  },
  {
    id: 'errors.rate',
    title: 'Error Volume Trend',
    category: 'trend',
    description: 'Per-minute transaction error rate over the last hour.',
    nrql: 'SELECT rate(count(*), 1 minute) AS errorsPerMinute FROM TransactionError TIMESERIES SINCE 1 hour ago',
  },
  {
    id: 'errors.percentage',
    title: 'Error Percentage',
    category: 'signal',
    description: 'Error percentage from all transactions over the last hour.',
    nrql: 'SELECT percentage(count(*), WHERE error IS true) AS errorPercentage FROM Transaction SINCE 1 hour ago',
  },
  {
    id: 'errors.classes',
    title: 'Top Error Classes',
    category: 'breakdown',
    description: 'Top error classes over the last 24 hours.',
    nrql: 'SELECT count(*) AS errorCount FROM TransactionError FACET error.class SINCE 24 hours ago LIMIT 20',
  },
  {
    id: 'transactions.slowest',
    title: 'Slowest Transactions',
    category: 'breakdown',
    description:
      'Average plus p95 and p99 transaction duration grouped by transaction name.',
    nrql: 'SELECT average(duration) AS avgDurationSeconds, percentile(duration, 95, 99) FROM Transaction FACET name SINCE 1 hour ago LIMIT 20',
  },
  {
    id: 'logs.count',
    title: 'Log Volume Snapshot',
    category: 'signal',
    description: 'Total log volume over the last hour.',
    nrql: 'SELECT count(*) AS logCount FROM Log SINCE 1 hour ago',
  },
  {
    id: 'logs.levels',
    title: 'Log Levels Breakdown',
    category: 'breakdown',
    description: 'Log counts grouped by severity level over the last hour.',
    nrql: 'SELECT count(*) AS logCount FROM Log FACET level SINCE 1 hour ago LIMIT MAX',
  },
  {
    id: 'apdex.summary',
    title: 'Apdex Summary',
    category: 'signal',
    description: 'Apdex score using a 0.5s target over the last hour.',
    nrql: 'SELECT apdex(duration, t:0.5) AS apdexScore FROM Transaction SINCE 1 hour ago',
  },
];

export const NRQL_BUNDLES: NrqlBundle[] = [
  {
    id: 'baseline',
    title: 'Baseline Health',
    description:
      'Recommended production baseline: traffic, latency, error rate, top errors, slow routes, and log severity distribution.',
    presetIds: [
      'throughput.count',
      'latency.summary',
      'errors.percentage',
      'errors.classes',
      'transactions.slowest',
      'logs.levels',
    ],
  },
  {
    id: 'trends',
    title: 'Trend Watch',
    description:
      'Traffic, latency, and error trends for regression detection over the last hour.',
    presetIds: ['throughput.rate', 'latency.timeseries', 'errors.rate'],
  },
  {
    id: 'golden-signals',
    title: 'Golden Signals',
    description:
      'Compact service-health view: throughput, latency, error percentage, and apdex.',
    presetIds: [
      'throughput.count',
      'latency.summary',
      'errors.percentage',
      'apdex.summary',
    ],
  },
];

const PRESET_INDEX = new Map(NRQL_PRESETS.map((preset) => [preset.id, preset]));
const BUNDLE_INDEX = new Map(NRQL_BUNDLES.map((bundle) => [bundle.id, bundle]));

export function getPreset(id: string): NrqlPreset {
  const preset = PRESET_INDEX.get(id);

  if (!preset) {
    throw new Error(
      `Unknown New Relic preset "${id}". Run \`pnpm nr -- list\` to see the catalog.`,
    );
  }

  return preset;
}

export function getBundle(id: string): NrqlBundle {
  const bundle = BUNDLE_INDEX.get(id);

  if (!bundle) {
    throw new Error(
      `Unknown New Relic bundle "${id}". Run \`pnpm nr -- list\` to see the catalog.`,
    );
  }

  return bundle;
}

export function hasPreset(id: string): boolean {
  return PRESET_INDEX.has(id);
}

export function hasBundle(id: string): boolean {
  return BUNDLE_INDEX.has(id);
}

export function resolveBundlePresets(bundle: NrqlBundle): NrqlPreset[] {
  return bundle.presetIds.map((presetId) => getPreset(presetId));
}

export function listPresetRows(): Array<Record<string, string>> {
  return NRQL_PRESETS.map((preset) => ({
    id: preset.id,
    category: preset.category,
    title: preset.title,
    description: preset.description,
  }));
}

export function listBundleRows(): Array<Record<string, string>> {
  return NRQL_BUNDLES.map((bundle) => ({
    id: bundle.id,
    title: bundle.title,
    description: bundle.description,
    presets: bundle.presetIds.join(', '),
  }));
}
