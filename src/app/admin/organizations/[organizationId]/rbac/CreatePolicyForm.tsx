'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  ACTIONS,
  RESOURCES,
  type AppAction,
  type Resource,
} from '@/core/contracts/resources-actions';

import { useStepUpFetch } from '@/shared/components/step-up/StepUpProvider';
import type {
  FormErrorsResponse,
  ServerErrorResponse,
} from '@/shared/types/api-response';

type PolicyRole = {
  id: string;
  name: string;
  isSystem: boolean;
};

type CreatePolicyState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

const RESOURCE_OPTIONS = Object.values(RESOURCES) as Resource[];
const ACTION_OPTIONS = Object.values(ACTIONS);
const ACTIONS_BY_RESOURCE = new Map<Resource, AppAction[]>(
  RESOURCE_OPTIONS.map((resource) => [
    resource,
    ACTION_OPTIONS.filter((action) => action.startsWith(`${resource}:`)),
  ]),
);

function getActionsForResource(resource: Resource): AppAction[] {
  return ACTIONS_BY_RESOURCE.get(resource) ?? [];
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const maybeServerError = payload as Partial<ServerErrorResponse>;
  if (
    maybeServerError.status === 'server_error' &&
    typeof maybeServerError.error === 'string'
  ) {
    return maybeServerError.error;
  }

  const maybeFormErrors = payload as Partial<FormErrorsResponse>;
  if (
    maybeFormErrors.status === 'form_errors' &&
    maybeFormErrors.errors &&
    typeof maybeFormErrors.errors === 'object'
  ) {
    const firstError = Object.values(maybeFormErrors.errors)
      .flat()
      .find((value) => typeof value === 'string');

    if (typeof firstError === 'string') {
      return firstError;
    }
  }

  return fallback;
}

export function CreatePolicyForm({
  organizationId,
  roles,
}: {
  organizationId: string;
  roles: PolicyRole[];
}) {
  const stepUpFetch = useStepUpFetch();
  const router = useRouter();
  const initialResource = RESOURCE_OPTIONS[0] ?? RESOURCES.ROUTE;
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '');
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow');
  const [resource, setResource] = useState<Resource>(initialResource);
  const [selectedActions, setSelectedActions] = useState<AppAction[]>(
    getActionsForResource(initialResource).slice(0, 1),
  );
  const [state, setState] = useState<CreatePolicyState>({ status: 'idle' });

  const availableActions = getActionsForResource(resource);

  function toggleAction(action: AppAction) {
    setSelectedActions((current) =>
      current.includes(action)
        ? current.filter((value) => value !== action)
        : [...current, action],
    );
  }

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: 'submitting' });

    try {
      const response = await stepUpFetch(
        `/api/admin/organizations/${organizationId}/policies`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roleId,
            effect,
            resource,
            actions: selectedActions,
          }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setState({
          status: 'error',
          message: getErrorMessage(
            payload,
            `Error ${response.status.toString()}`,
          ),
        });
        return;
      }

      setState({ status: 'success', message: 'Policy created.' });
      router.refresh();
    } catch {
      setState({
        status: 'error',
        message: 'Network error. Please try again.',
      });
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Create role policy
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            This first mutation slice is constrained: choose one organization
            role, known resources, known actions, and no free-form conditions.
          </p>
        </div>
        <span className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          Conditions editing stays deferred
        </span>
      </div>

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="mt-4 space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-900 dark:text-zinc-100">
              Role
            </span>
            <select
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
              disabled={state.status === 'submitting' || roles.length === 0}
              className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-1 focus:ring-black focus:outline-none disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-900 dark:text-zinc-100">
              Effect
            </span>
            <select
              value={effect}
              onChange={(event) =>
                setEffect(event.target.value as 'allow' | 'deny')
              }
              disabled={state.status === 'submitting'}
              className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-1 focus:ring-black focus:outline-none disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="allow">allow</option>
              <option value="deny">deny</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-900 dark:text-zinc-100">
              Resource
            </span>
            <select
              value={resource}
              onChange={(event) => {
                const nextResource = event.target.value as Resource;
                setResource(nextResource);
                setSelectedActions(
                  getActionsForResource(nextResource).slice(0, 1),
                );
              }}
              disabled={state.status === 'submitting'}
              className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-1 focus:ring-black focus:outline-none disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {RESOURCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Actions
          </legend>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {availableActions.map((action) => (
              <label
                key={action}
                className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
              >
                <input
                  type="checkbox"
                  checked={selectedActions.includes(action)}
                  onChange={() => toggleAction(action)}
                  disabled={state.status === 'submitting'}
                />
                <span className="text-zinc-700 dark:text-zinc-300">
                  {action}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={
            state.status === 'submitting' ||
            !roleId ||
            selectedActions.length === 0
          }
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
        >
          {state.status === 'submitting' ? 'Creating…' : 'Create policy'}
        </button>

        {state.status === 'error' ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {state.message}
          </p>
        ) : null}

        {state.status === 'success' ? (
          <p className="text-sm text-green-600 dark:text-green-400">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
