type ActivityState = {
  totalStarts: number;
  activeCount: number;
  lastStartedAt?: number;
  lastFinishedAt?: number;
};

interface RuntimeDiagnosticState {
  infrastructureInitializations: number;
  infrastructureReuses: number;
  migrationInvocations: number;
  migrationActiveCount: number;
  pgliteInitializations: number;
  pglitePaths: Map<string, ActivityState>;
  bootstrapEntries: Map<string, ActivityState>;
  provisioningSubjects: Map<string, ActivityState>;
  provisioningInternalSubjects: Map<string, ActivityState>;
}

declare global {
  var __NEXTJS16_BOILERPLATE_RUNTIME_DIAGNOSTICS__:
    | RuntimeDiagnosticState
    | undefined;
}

export function getRuntimeDiagnosticState(): RuntimeDiagnosticState {
  if (!globalThis.__NEXTJS16_BOILERPLATE_RUNTIME_DIAGNOSTICS__) {
    globalThis.__NEXTJS16_BOILERPLATE_RUNTIME_DIAGNOSTICS__ = {
      infrastructureInitializations: 0,
      infrastructureReuses: 0,
      migrationInvocations: 0,
      migrationActiveCount: 0,
      pgliteInitializations: 0,
      pglitePaths: new Map<string, ActivityState>(),
      bootstrapEntries: new Map<string, ActivityState>(),
      provisioningSubjects: new Map<string, ActivityState>(),
      provisioningInternalSubjects: new Map<string, ActivityState>(),
    };
  }

  return globalThis.__NEXTJS16_BOILERPLATE_RUNTIME_DIAGNOSTICS__;
}

export function getOrCreateActivityState(
  map: Map<string, ActivityState>,
  key: string,
): ActivityState {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const created: ActivityState = {
    totalStarts: 0,
    activeCount: 0,
  };

  map.set(key, created);
  return created;
}
