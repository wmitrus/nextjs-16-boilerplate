import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Administration',
  description: 'Administration hub — manage users, roles, waitlist, and more.',
};

interface AdminCard {
  title: string;
  description: string;
  href: string;
  status: 'active' | 'coming-soon';
  icon: React.ReactNode;
}

function ShieldIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
      />
    </svg>
  );
}

function WaitlistIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
      />
    </svg>
  );
}

function RolesIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z"
      />
    </svg>
  );
}

function FeatureFlagsIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5"
      />
    </svg>
  );
}

function TeamsIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
      />
    </svg>
  );
}

function InvitationsIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
      />
    </svg>
  );
}

function RbacIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
      />
    </svg>
  );
}

const adminCards: AdminCard[] = [
  {
    title: 'Waitlist',
    description:
      'Review pending waitlist applications. Approve to send an invitation, or reject with an optional notification email.',
    href: '/admin/waitlist',
    status: 'active',
    icon: <WaitlistIcon />,
  },
  {
    title: 'Users',
    description:
      'Browse, search, and manage all registered users. Suspend, deactivate, or update user details.',
    href: '/admin/users',
    status: 'active',
    icon: <UsersIcon />,
  },
  {
    title: 'Teams',
    description:
      'Manage organizations and teams. Create, rename, archive, or dissolve organizational units.',
    href: '/admin/teams',
    status: 'coming-soon',
    icon: <TeamsIcon />,
  },
  {
    title: 'Roles',
    description:
      'Define and manage named roles within your organizations. Set system roles and custom roles per tenant.',
    href: '/admin/roles',
    status: 'coming-soon',
    icon: <RolesIcon />,
  },
  {
    title: 'RBAC & Policies',
    description:
      'Manage ABAC policies, permissions, and role-to-policy assignments across your tenants.',
    href: '/admin/rbac',
    status: 'coming-soon',
    icon: <RbacIcon />,
  },
  {
    title: 'Feature Flags',
    description:
      'Toggle features per tenant or globally. Manage feature flag values and overrides.',
    href: '/admin/feature-flags',
    status: 'coming-soon',
    icon: <FeatureFlagsIcon />,
  },
  {
    title: 'Security',
    description:
      'View audit logs, review security events, and manage API access policies.',
    href: '/admin/security',
    status: 'coming-soon',
    icon: <ShieldIcon />,
  },
  {
    title: 'Invitations',
    description:
      'Send direct invitations to users. Track pending and expired invitation links.',
    href: '/admin/invitations',
    status: 'active',
    icon: <InvitationsIcon />,
  },
];

export default function AdminPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Administration
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage users, roles, access control, and platform configuration.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {adminCards.map((card) => (
          <AdminCard key={card.href} card={card} />
        ))}
      </div>
    </div>
  );
}

function AdminCard({ card }: { card: AdminCard }) {
  const isActive = card.status === 'active';

  const content = (
    <div
      className={[
        'group relative flex flex-col rounded-xl border p-5 transition-all',
        isActive
          ? 'border-zinc-200 bg-white shadow-sm hover:border-zinc-300 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
          : 'border-zinc-200 bg-white/50 opacity-60 dark:border-zinc-800 dark:bg-zinc-900/50',
      ].join(' ')}
    >
      <div className="mb-3 flex items-start justify-between">
        <span
          className={[
            'flex h-10 w-10 items-center justify-center rounded-lg',
            isActive
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
              : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
          ].join(' ')}
        >
          {card.icon}
        </span>
        {!isActive && (
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            Coming soon
          </span>
        )}
      </div>
      <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {card.title}
      </h2>
      <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        {card.description}
      </p>
      {isActive && (
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-zinc-900 dark:text-zinc-100">
          Manage
          <svg
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
            />
          </svg>
        </span>
      )}
    </div>
  );

  if (isActive) {
    return <Link href={card.href}>{content}</Link>;
  }

  return <div>{content}</div>;
}
