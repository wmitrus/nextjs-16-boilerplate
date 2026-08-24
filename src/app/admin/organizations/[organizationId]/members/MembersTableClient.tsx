'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useStepUpFetch } from '@/shared/components/step-up/StepUpProvider';
import type {
  FormErrorsResponse,
  ServerErrorResponse,
} from '@/shared/types/api-response';

import type {
  OrganizationMemberSummaryDto,
  OrganizationMembersPageDto,
} from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';

type MemberRoleState = 'idle' | 'saving' | 'saved' | 'error';

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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function MembersTableClient({
  organizationId,
  isArchived,
  roles,
  initialMembers,
}: {
  organizationId: string;
  isArchived: boolean;
  roles: OrganizationMembersPageDto['roles'];
  initialMembers: OrganizationMemberSummaryDto[];
}) {
  const stepUpFetch = useStepUpFetch();
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [selectedRoleIds, setSelectedRoleIds] = useState<
    Partial<Record<string, string>>
  >(
    Object.fromEntries(
      initialMembers.map((member) => [member.userId, member.roleId]),
    ),
  );
  const [rowState, setRowState] = useState<
    Partial<Record<string, MemberRoleState>>
  >({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  async function handleSave(member: OrganizationMemberSummaryDto) {
    const nextRoleId = selectedRoleIds[member.userId] ?? member.roleId;
    if (nextRoleId === member.roleId || isArchived) {
      return;
    }

    setRowState((prev) => ({ ...prev, [member.userId]: 'saving' }));
    setRowError((prev) => ({ ...prev, [member.userId]: '' }));

    try {
      const response = await stepUpFetch(
        `/api/admin/organizations/${organizationId}/members/${member.userId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleId: nextRoleId }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setRowState((prev) => ({ ...prev, [member.userId]: 'error' }));
        setRowError((prev) => ({
          ...prev,
          [member.userId]: getErrorMessage(
            body,
            `HTTP ${response.status.toString()}`,
          ),
        }));
        return;
      }

      const json = (await response.json()) as {
        data: {
          membership: {
            roleId: string;
            roleName: string;
            roleIsSystem: boolean;
          };
        };
      };

      setMembers((prev) =>
        prev.map((current) =>
          current.userId === member.userId
            ? {
                ...current,
                roleId: json.data.membership.roleId,
                roleName: json.data.membership.roleName,
                roleIsSystem: json.data.membership.roleIsSystem,
              }
            : current,
        ),
      );
      setRowState((prev) => ({ ...prev, [member.userId]: 'saved' }));
      router.refresh();
    } catch (error) {
      setRowState((prev) => ({ ...prev, [member.userId]: 'error' }));
      setRowError((prev) => ({
        ...prev,
        [member.userId]:
          error instanceof Error
            ? error.message
            : 'Unable to update member role',
      }));
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
        <thead className="bg-zinc-50 dark:bg-zinc-800/60">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
              Member
            </th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
              Role
            </th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
              Joined
            </th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
              Status
            </th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
          {members.map((member) => {
            const pendingRoleId =
              selectedRoleIds[member.userId] ?? member.roleId;
            const dirty = pendingRoleId !== member.roleId;
            const state = rowState[member.userId] ?? 'idle';

            return (
              <tr key={member.userId}>
                <td className="px-4 py-4 align-top">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    {member.displayName ?? 'Unnamed user'}
                  </div>
                  <div className="text-zinc-500 dark:text-zinc-400">
                    {member.email}
                  </div>
                </td>
                <td className="px-4 py-4 align-top">
                  <div className="flex flex-col gap-2">
                    <select
                      value={pendingRoleId}
                      onChange={(event) =>
                        setSelectedRoleIds((prev) => ({
                          ...prev,
                          [member.userId]: event.target.value,
                        }))
                      }
                      disabled={isArchived || state === 'saving'}
                      className="min-w-44 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                      aria-label={`Role for ${member.email}`}
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                          {role.isSystem ? ' (system)' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Current role: {member.roleName}
                    </div>
                    {rowError[member.userId] ? (
                      <div className="text-xs text-red-600 dark:text-red-400">
                        {rowError[member.userId]}
                      </div>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-4 align-top text-zinc-600 dark:text-zinc-300">
                  {formatDate(member.joinedAt)}
                </td>
                <td className="px-4 py-4 align-top">
                  <span
                    className={[
                      'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                      member.deactivatedAt
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                    ].join(' ')}
                  >
                    {member.deactivatedAt ? 'Deactivated' : 'Active'}
                  </span>
                </td>
                <td className="px-4 py-4 align-top">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSave(member)}
                      disabled={!dirty || isArchived || state === 'saving'}
                      className="inline-flex w-fit items-center rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                    >
                      {state === 'saving' ? 'Saving…' : 'Save role'}
                    </button>
                    {state === 'saved' && !dirty ? (
                      <div className="text-xs text-emerald-600 dark:text-emerald-400">
                        Saved
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
