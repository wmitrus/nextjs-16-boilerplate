'use client';

import * as React from 'react';

import { useStepUpFetch } from '@/shared/components/step-up/StepUpProvider';

type AuditSettingSource = 'tenant-override' | 'global' | 'taxonomy-default';

interface AdminAuditSetting {
  id: string | null;
  category: string;
  tenantId: string | null;
  source: AuditSettingSource;
  enabled: boolean;
  retentionDays: number;
  sampleRate: number | null;
  captureInputOnSuccess: boolean;
  updatedByUserId: string | null;
  updatedAt: string | null;
}

/**
 * The caller's own mutation scope, as derived server-side. A platform admin
 * manages the global defaults shown here; an ABAC-authorized tenant owner
 * manages their own tenant's overrides -- the server derives which one from
 * the verified session, so this client never needs (or offers) a tenantId
 * field. See SEC-26 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
 */
type AdminScope = { isPlatformAdmin: boolean; tenantId: string | null };

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; settings: AdminAuditSetting[]; scope: AdminScope }
  | { status: 'error'; message: string };

type RowActionStatus = 'pending' | 'done' | 'error';

const CATEGORY_LABELS: Record<string, string> = {
  auth: 'Authentication',
  admin_access: 'Admin panel access',
  organization: 'Organizations',
  membership: 'Memberships',
  rbac_policy: 'RBAC & policies',
  feature_flag: 'Feature flags',
  waitlist: 'Waitlist',
  billing: 'Billing',
  security_event: 'Security events',
  server_action: 'Server actions (generic)',
};

const SOURCE_LABELS: Record<AuditSettingSource, string> = {
  'tenant-override': 'Your tenant override',
  global: 'Global default (customized)',
  'taxonomy-default': 'Taxonomy default (unset)',
};

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

type DraftFields = {
  retentionDays: string;
  sampleRate: string;
  captureInputOnSuccess: boolean;
};

function draftFromSetting(setting: AdminAuditSetting): DraftFields {
  return {
    retentionDays: String(setting.retentionDays),
    sampleRate: setting.sampleRate === null ? '' : String(setting.sampleRate),
    captureInputOnSuccess: setting.captureInputOnSuccess,
  };
}

export function AuditSettingsClient() {
  const stepUpFetch = useStepUpFetch();
  const [state, setState] = React.useState<FetchState>({ status: 'idle' });
  const [toggleState, setToggleState] = React.useState<
    Map<string, RowActionStatus>
  >(new Map());
  const [resetState, setResetState] = React.useState<
    Map<string, RowActionStatus>
  >(new Map());
  const [editOpen, setEditOpen] = React.useState<Map<string, boolean>>(
    new Map(),
  );
  const [editDrafts, setEditDrafts] = React.useState<Map<string, DraftFields>>(
    new Map(),
  );
  const [editState, setEditState] = React.useState<
    Map<string, RowActionStatus>
  >(new Map());
  const [editError, setEditError] = React.useState<Map<string, string>>(
    new Map(),
  );

  const fetchSettings = React.useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/admin/audit-log-settings');
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setState({
          status: 'error',
          message: body.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      const json = (await res.json()) as {
        data: { settings: AdminAuditSetting[]; scope: AdminScope };
      };
      setState({
        status: 'success',
        settings: json.data.settings,
        scope: json.data.scope,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setState({ status: 'error', message: msg });
    }
  }, []);

  React.useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  async function saveSetting(
    setting: AdminAuditSetting,
    overrides: Partial<{
      enabled: boolean;
      retentionDays: number;
      sampleRate: number | null;
      captureInputOnSuccess: boolean;
    }>,
  ): Promise<boolean> {
    const res = await stepUpFetch('/api/admin/audit-log-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: setting.category,
        enabled: overrides.enabled ?? setting.enabled,
        retentionDays: overrides.retentionDays ?? setting.retentionDays,
        sampleRate:
          overrides.sampleRate !== undefined
            ? overrides.sampleRate
            : setting.sampleRate,
        captureInputOnSuccess:
          overrides.captureInputOnSuccess ?? setting.captureInputOnSuccess,
      }),
    });
    return res.ok;
  }

  async function handleToggle(setting: AdminAuditSetting) {
    setToggleState((prev) => new Map(prev).set(setting.category, 'pending'));
    const ok = await saveSetting(setting, { enabled: !setting.enabled });
    if (!ok) {
      setToggleState((prev) => new Map(prev).set(setting.category, 'error'));
      return;
    }
    setToggleState((prev) => new Map(prev).set(setting.category, 'done'));
    void fetchSettings();
  }

  function openEdit(setting: AdminAuditSetting) {
    setEditDrafts((prev) =>
      new Map(prev).set(setting.category, draftFromSetting(setting)),
    );
    setEditOpen((prev) => new Map(prev).set(setting.category, true));
    setEditError((prev) => {
      const next = new Map(prev);
      next.delete(setting.category);
      return next;
    });
  }

  async function handleSaveEdit(setting: AdminAuditSetting) {
    const draft = editDrafts.get(setting.category);
    if (!draft) return;

    const retentionDays = Number.parseInt(draft.retentionDays, 10);
    if (!Number.isFinite(retentionDays)) {
      setEditError((prev) =>
        new Map(prev).set(setting.category, 'Retention days must be a number'),
      );
      return;
    }
    const sampleRate =
      draft.sampleRate.trim() === '' ? null : Number(draft.sampleRate);
    if (sampleRate !== null && !Number.isFinite(sampleRate)) {
      setEditError((prev) =>
        new Map(prev).set(setting.category, 'Sample rate must be a number'),
      );
      return;
    }

    setEditState((prev) => new Map(prev).set(setting.category, 'pending'));
    const ok = await saveSetting(setting, {
      retentionDays,
      sampleRate,
      captureInputOnSuccess: draft.captureInputOnSuccess,
    });
    if (!ok) {
      setEditState((prev) => new Map(prev).set(setting.category, 'error'));
      setEditError((prev) =>
        new Map(prev).set(setting.category, 'Save failed — try again'),
      );
      return;
    }
    setEditState((prev) => new Map(prev).set(setting.category, 'done'));
    setEditOpen((prev) => new Map(prev).set(setting.category, false));
    void fetchSettings();
  }

  async function handleReset(setting: AdminAuditSetting) {
    setResetState((prev) => new Map(prev).set(setting.category, 'pending'));
    try {
      const res = await stepUpFetch('/api/admin/audit-log-settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: setting.category }),
      });
      if (!res.ok) {
        setResetState((prev) => new Map(prev).set(setting.category, 'error'));
        return;
      }
      setResetState((prev) => new Map(prev).set(setting.category, 'done'));
      void fetchSettings();
    } catch {
      setResetState((prev) => new Map(prev).set(setting.category, 'error'));
    }
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="space-y-3">
        {[...Array<undefined>(6)].map((_, i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"
          />
        ))}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        Error: {state.message}
      </div>
    );
  }

  const { settings, scope } = state;

  return (
    <div>
      <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
        {scope.isPlatformAdmin ? (
          <>
            Managing <strong>global defaults</strong> — these apply to every
            tenant that has not set its own override.
          </>
        ) : (
          <>
            Managing overrides for <strong>your tenant</strong> (
            {scope.tenantId}). Categories without an override use the global
            default shown below.
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-700 dark:bg-zinc-800/50">
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                Category
              </th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                Logging
              </th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                Retention
              </th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                Sample rate
              </th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                Source
              </th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                Updated
              </th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {settings.map((setting) => {
              const isEditing = editOpen.get(setting.category) ?? false;
              const draft =
                editDrafts.get(setting.category) ?? draftFromSetting(setting);

              return (
                <tr
                  key={setting.category}
                  className="bg-white align-top hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-800 dark:text-zinc-200">
                      {CATEGORY_LABELS[setting.category] ?? setting.category}
                    </div>
                    <div className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                      {setting.category}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void handleToggle(setting)}
                      disabled={toggleState.get(setting.category) === 'pending'}
                      className={[
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium disabled:opacity-50',
                        toggleState.get(setting.category) === 'error'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : setting.enabled
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
                      ].join(' ')}
                    >
                      {toggleState.get(setting.category) === 'pending'
                        ? 'Saving…'
                        : toggleState.get(setting.category) === 'error'
                          ? 'Failed — retry'
                          : setting.enabled
                            ? 'On'
                            : 'Off'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {isEditing ? (
                      <input
                        type="number"
                        min={7}
                        max={730}
                        value={draft.retentionDays}
                        onChange={(e) =>
                          setEditDrafts((prev) =>
                            new Map(prev).set(setting.category, {
                              ...draft,
                              retentionDays: e.target.value,
                            }),
                          )
                        }
                        className="w-20 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800"
                        aria-label="Retention days"
                      />
                    ) : (
                      `${setting.retentionDays} days`
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {isEditing ? (
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        placeholder="1.0"
                        value={draft.sampleRate}
                        onChange={(e) =>
                          setEditDrafts((prev) =>
                            new Map(prev).set(setting.category, {
                              ...draft,
                              sampleRate: e.target.value,
                            }),
                          )
                        }
                        className="w-20 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800"
                        aria-label="Sample rate"
                      />
                    ) : (
                      (setting.sampleRate ?? 'All')
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        setting.source === 'taxonomy-default'
                          ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                      ].join(' ')}
                    >
                      {SOURCE_LABELS[setting.source]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {formatDate(setting.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                          <input
                            type="checkbox"
                            checked={draft.captureInputOnSuccess}
                            onChange={(e) =>
                              setEditDrafts((prev) =>
                                new Map(prev).set(setting.category, {
                                  ...draft,
                                  captureInputOnSuccess: e.target.checked,
                                }),
                              )
                            }
                          />
                          Capture input on success
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSaveEdit(setting)}
                            disabled={
                              editState.get(setting.category) === 'pending'
                            }
                            className="text-xs text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                          >
                            {editState.get(setting.category) === 'pending'
                              ? 'Saving…'
                              : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setEditOpen((prev) =>
                                new Map(prev).set(setting.category, false),
                              )
                            }
                            className="text-xs text-zinc-400 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                        {editError.get(setting.category) && (
                          <span className="text-xs text-red-600 dark:text-red-400">
                            {editError.get(setting.category)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(setting)}
                          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Edit
                        </button>
                        {/* A tenant-scoped admin's 'global' row is inherited,
                            not an override they own -- there is no
                            tenant-scoped row for DELETE to find, so it
                            404s. Only offer reset for a row the caller can
                            actually delete: their own tenant override, or
                            (for a platform admin) a real global row. */}
                        {(setting.source === 'tenant-override' ||
                          (setting.source === 'global' &&
                            scope.isPlatformAdmin)) && (
                          <button
                            type="button"
                            onClick={() => void handleReset(setting)}
                            disabled={
                              resetState.get(setting.category) === 'pending'
                            }
                            className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                          >
                            {resetState.get(setting.category) === 'pending'
                              ? 'Resetting…'
                              : resetState.get(setting.category) === 'error'
                                ? 'Failed — retry'
                                : 'Reset to default'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
