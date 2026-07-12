'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type {
  FormErrorsResponse,
  ServerErrorResponse,
} from '@/shared/types/api-response';

type CreateRoleState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; roleName: string }
  | { status: 'error'; message: string };

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

export function CreateRoleForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [roleName, setRoleName] = useState('');
  const [state, setState] = useState<CreateRoleState>({ status: 'idle' });

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: 'submitting' });

    try {
      const response = await fetch(
        `/api/admin/organizations/${organizationId}/roles`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: roleName }),
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

      setState({ status: 'success', roleName });
      setRoleName('');
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
            Create custom role
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Custom roles are organization-scoped. Reserved system names like
            owner and member cannot be reused.
          </p>
        </div>
        <span className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          Rename and delete are available in the table below
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-4 flex flex-col gap-3 sm:flex-row"
      >
        <input
          type="text"
          value={roleName}
          onChange={(event) => setRoleName(event.target.value)}
          placeholder="e.g. billing_manager"
          maxLength={50}
          className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-1 focus:ring-black focus:outline-none disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          disabled={state.status === 'submitting'}
          required
        />
        <button
          type="submit"
          disabled={state.status === 'submitting' || !roleName.trim()}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
        >
          {state.status === 'submitting' ? 'Creating…' : 'Create role'}
        </button>
      </form>

      {state.status === 'error' ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      ) : null}

      {state.status === 'success' ? (
        <p className="mt-3 text-sm text-green-600 dark:text-green-400">
          Role created: {state.roleName}
        </p>
      ) : null}
    </section>
  );
}
