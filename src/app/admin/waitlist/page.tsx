import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { WaitlistActions } from './WaitlistActions';

import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import type { WaitlistEntry } from '@/modules/waitlist/domain/types';
import { DefaultWaitlistService } from '@/modules/waitlist/infrastructure/DefaultWaitlistService';
import { DrizzleWaitlistRepository } from '@/modules/waitlist/infrastructure/drizzle/DrizzleWaitlistRepository';

export const metadata: Metadata = {
  title: 'Waitlist — Administration',
  description: 'Review and manage waitlist applications.',
};

function resolveWaitlistService() {
  const container = getAppContainer();
  const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
  const emailService = createEmailService({
    provider: env.EMAIL_PROVIDER,
    resendApiKey: env.RESEND_API_KEY,
    resendFromEmail: env.RESEND_FROM_EMAIL,
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpSecure: env.SMTP_SECURE,
    smtpUser: env.SMTP_USER,
    smtpPass: env.SMTP_PASS,
    smtpFromEmail: env.SMTP_FROM_EMAIL,
  });
  return new DefaultWaitlistService(
    new DrizzleWaitlistRepository(db),
    emailService,
  );
}

export default async function WaitlistAdminPage() {
  await connection();
  await getServerRequestLogContext({ pathname: '/admin/waitlist' });

  const service = resolveWaitlistService();
  const entries = await service.listPending();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Link
              href="/admin"
              className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Administration
            </Link>
            <span>/</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              Waitlist
            </span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Waitlist Management
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Review pending applications. Approve to send an invitation or reject
            with an optional notification.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {entries.length} pending
          </span>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <WaitlistTable entries={entries} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white py-16 dark:border-zinc-700 dark:bg-zinc-900">
      <svg
        className="mb-3 h-10 w-10 text-zinc-300 dark:text-zinc-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
        />
      </svg>
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        No pending applications
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        All waitlist entries have been processed.
      </p>
    </div>
  );
}

function WaitlistTable({ entries }: { entries: WaitlistEntry[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-800/50">
            <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Applicant
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Applied
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Status
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {entries.map((entry) => (
            <WaitlistRow key={entry.id} entry={entry} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WaitlistRow({ entry }: { entry: WaitlistEntry }) {
  const initials = entry.name
    ? entry.name
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : (entry.email[0] ?? '?').toUpperCase();

  const appliedDate = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(entry.createdAt);

  return (
    <tr className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-white dark:bg-zinc-200 dark:text-zinc-900">
            {initials}
          </span>
          <div>
            {entry.name && (
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {entry.name}
              </p>
            )}
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {entry.email}
            </p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-zinc-500 dark:text-zinc-400">
        {appliedDate}
      </td>
      <td className="px-6 py-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Pending
        </span>
      </td>
      <td className="px-6 py-4 text-right">
        <WaitlistActions entryId={entry.id} entryEmail={entry.email} />
      </td>
    </tr>
  );
}
