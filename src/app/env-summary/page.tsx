import React from 'react';

import { getEnvDiagnostics } from '@/features/security-showcase/lib/env-diagnostics';

export default function EnvSummaryPage() {
  const diagnostics = getEnvDiagnostics();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Env Summary</h1>
        <p className="text-sm text-gray-600">
          Runtime environment diagnostics for deployment-critical configuration.
        </p>
      </header>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <p className="mb-2 text-sm">
          Status:{' '}
          <strong>{diagnostics.ok ? 'Healthy' : 'Configuration Issues'}</strong>
        </p>
        <p className="mb-4 text-xs text-gray-500">
          Environment: {diagnostics.environment}
        </p>

        <h2 className="mb-2 text-base font-semibold">Required Variables</h2>
        <ul className="mb-4 space-y-1 text-sm">
          {diagnostics.required.map((entry) => (
            <li key={entry.name}>
              {entry.name}:{' '}
              {entry.present ? `set (${entry.maskedValue})` : 'missing'}
            </li>
          ))}
        </ul>

        {diagnostics.pairIssues.length > 0 && (
          <>
            <h2 className="mb-2 text-base font-semibold">Pair Issues</h2>
            <ul className="mb-4 list-disc pl-5 text-sm text-gray-700">
              {diagnostics.pairIssues.map((issue) => (
                <li key={issue.pair.join(':')}>
                  {issue.pair[0]} + {issue.pair[1]}: {issue.issue}
                </li>
              ))}
            </ul>
          </>
        )}

        {diagnostics.conditionalIssues.length > 0 && (
          <>
            <h2 className="mb-2 text-base font-semibold">Conditional Issues</h2>
            <ul className="mb-4 list-disc pl-5 text-sm text-gray-700">
              {diagnostics.conditionalIssues.map((issue) => (
                <li key={`${issue.condition}:${issue.missing.join('|')}`}>
                  {issue.condition}: {issue.issue} Missing:{' '}
                  {issue.missing.join(', ')}
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className="mb-2 text-base font-semibold">Suggestions</h2>
        <ul className="list-disc pl-5 text-sm text-gray-700">
          {diagnostics.suggestions.map((suggestion) => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
