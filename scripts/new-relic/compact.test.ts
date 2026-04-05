// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { buildCompactBundleResult } from './compact';

describe('new-relic compact bundle summary', () => {
  it('builds a compact baseline-style summary from executed query results', () => {
    const result = buildCompactBundleResult({
      id: 'baseline',
      title: 'Baseline Health',
      description: 'Recommended production baseline.',
      queryResults: [
        {
          id: 'throughput.count',
          title: 'Throughput Snapshot',
          category: 'signal',
          description: 'Transaction count over the last hour.',
          nrql: 'SELECT count(*)',
          rows: [{ transactionCount: 455 }],
        },
        {
          id: 'latency.summary',
          title: 'Latency Summary',
          category: 'signal',
          description: 'Latency summary.',
          nrql: 'SELECT average(duration), percentile(duration, 50, 95, 99)',
          rows: [
            {
              avgDurationSeconds: 0.12,
              'percentile.duration': {
                '50.0': 0.08,
                '95.0': 0.24,
                '99.0': 0.55,
              },
            },
          ],
        },
        {
          id: 'errors.percentage',
          title: 'Error Percentage',
          category: 'signal',
          description: 'Error percentage.',
          nrql: 'SELECT percentage(...)',
          rows: [{ errorPercentage: 1.8 }],
        },
        {
          id: 'errors.classes',
          title: 'Top Error Classes',
          category: 'breakdown',
          description: 'Top error classes.',
          nrql: 'SELECT count(*) FACET error.class',
          rows: [
            { 'error.class': 'TypeError', errorCount: 9 },
            { 'error.class': 'TimeoutError', errorCount: 3 },
          ],
        },
        {
          id: 'transactions.slowest',
          title: 'Slowest Transactions',
          category: 'breakdown',
          description: 'Slowest transactions.',
          nrql: 'SELECT average(duration), percentile(duration, 95, 99) FACET name',
          rows: [
            {
              name: 'WebTransaction/Nextjs/GET//api/users',
              'percentile.duration': { '95.0': 0.71 },
            },
          ],
        },
        {
          id: 'logs.levels',
          title: 'Log Levels Breakdown',
          category: 'breakdown',
          description: 'Log counts by level.',
          nrql: 'SELECT count(*) FACET level',
          rows: [
            { level: 'error', logCount: 12 },
            { level: 'warn', logCount: 5 },
          ],
        },
      ],
    });

    expect(result.summary.transactionCount).toBe(455);
    expect(result.summary.avgDurationSeconds).toBe(0.12);
    expect(result.summary.p95DurationSeconds).toBe(0.24);
    expect(result.summary.errorPercentage).toBe(1.8);
    expect(result.summary.topErrorClass).toBe('TypeError');
    expect(result.summary.slowestTransaction).toBe(
      'WebTransaction/Nextjs/GET//api/users',
    );
    expect(result.summary.dominantLogLevel).toBe('error');
    expect(result.highlights.topErrorClasses).toHaveLength(2);
  });
});
