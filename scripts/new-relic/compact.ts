import type { ResultRow } from './lib';

export interface ExecutedQueryResult {
  id: string;
  title: string;
  category: string;
  description: string;
  nrql: string;
  rows: ResultRow[];
}

export interface CompactBundleResult {
  kind: 'bundle-compact';
  id: string;
  title: string;
  description: string;
  summary: Record<string, number | string | undefined>;
  highlights: {
    topErrorClasses: ResultRow[];
    slowestTransactions: ResultRow[];
    logLevels: ResultRow[];
  };
}

function getOwnPropertyValue(
  record: Record<string, unknown>,
  expectedKey: string,
): unknown | undefined {
  for (const [entryKey, entryValue] of Object.entries(record)) {
    if (entryKey === expectedKey) {
      return entryValue;
    }
  }

  return undefined;
}

function getCandidateValue(
  row: ResultRow | undefined,
  path: string[],
): unknown | undefined {
  if (!row) return undefined;

  let current: unknown = row;

  for (const [index, segment] of path.entries()) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    const objectValue = current as Record<string, unknown>;
    const joinedKey = path.slice(index).join('.');
    const joinedValue = getOwnPropertyValue(objectValue, joinedKey);
    if (joinedValue !== undefined) return joinedValue;

    const segmentValue = getOwnPropertyValue(objectValue, segment);
    if (segmentValue === undefined) return undefined;
    current = segmentValue;
  }

  return current;
}

function getPreferredNumericValue(
  row: ResultRow | undefined,
  candidates: string[][],
): number | undefined {
  for (const candidate of candidates) {
    const value = getCandidateValue(row, candidate);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function getPreferredStringValue(
  row: ResultRow | undefined,
  candidates: string[][],
): string | undefined {
  for (const candidate of candidates) {
    const value = getCandidateValue(row, candidate);
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function findQueryResult(
  queryResults: ExecutedQueryResult[],
  id: string,
): ExecutedQueryResult | undefined {
  return queryResults.find((queryResult) => queryResult.id === id);
}

export function buildCompactBundleResult(input: {
  id: string;
  title: string;
  description: string;
  queryResults: ExecutedQueryResult[];
}): CompactBundleResult {
  const throughput = findQueryResult(input.queryResults, 'throughput.count');
  const latency = findQueryResult(input.queryResults, 'latency.summary');
  const errorPercentage = findQueryResult(
    input.queryResults,
    'errors.percentage',
  );
  const apdex = findQueryResult(input.queryResults, 'apdex.summary');
  const topErrors = findQueryResult(input.queryResults, 'errors.classes');
  const slowestTransactions = findQueryResult(
    input.queryResults,
    'transactions.slowest',
  );
  const logLevels = findQueryResult(input.queryResults, 'logs.levels');

  const firstErrorRow = topErrors?.rows[0];
  const firstSlowRow = slowestTransactions?.rows[0];
  const firstLogRow = logLevels?.rows[0];

  const summary: CompactBundleResult['summary'] = {
    transactionCount: getPreferredNumericValue(throughput?.rows[0], [
      ['transactionCount'],
      ['count'],
    ]),
    avgDurationSeconds: getPreferredNumericValue(latency?.rows[0], [
      ['avgDurationSeconds'],
      ['average.duration'],
    ]),
    p50DurationSeconds: getPreferredNumericValue(latency?.rows[0], [
      ['percentile.duration', '50'],
      ['percentile.duration', '50.0'],
    ]),
    p95DurationSeconds: getPreferredNumericValue(latency?.rows[0], [
      ['percentile.duration', '95'],
      ['percentile.duration', '95.0'],
      ['p95DurationSeconds'],
    ]),
    p99DurationSeconds: getPreferredNumericValue(latency?.rows[0], [
      ['percentile.duration', '99'],
      ['percentile.duration', '99.0'],
      ['p99DurationSeconds'],
    ]),
    errorPercentage: getPreferredNumericValue(errorPercentage?.rows[0], [
      ['errorPercentage'],
      ['percentage'],
    ]),
    apdexScore: getPreferredNumericValue(apdex?.rows[0], [
      ['apdexScore'],
      ['apdex'],
    ]),
    topErrorClass: getPreferredStringValue(firstErrorRow, [
      ['error.class'],
      ['facet'],
    ]),
    topErrorCount: getPreferredNumericValue(firstErrorRow, [
      ['errorCount'],
      ['count'],
    ]),
    slowestTransaction: getPreferredStringValue(firstSlowRow, [
      ['name'],
      ['facet'],
    ]),
    slowestTransactionP95Seconds: getPreferredNumericValue(firstSlowRow, [
      ['percentile.duration', '95'],
      ['percentile.duration', '95.0'],
      ['p95DurationSeconds'],
    ]),
    dominantLogLevel: getPreferredStringValue(firstLogRow, [
      ['level'],
      ['facet'],
    ]),
    dominantLogCount: getPreferredNumericValue(firstLogRow, [
      ['logCount'],
      ['count'],
    ]),
  };

  return {
    kind: 'bundle-compact',
    id: input.id,
    title: input.title,
    description: input.description,
    summary,
    highlights: {
      topErrorClasses: (topErrors?.rows ?? []).slice(0, 5),
      slowestTransactions: (slowestTransactions?.rows ?? []).slice(0, 5),
      logLevels: (logLevels?.rows ?? []).slice(0, 5),
    },
  };
}
