'use client';

import { signOut } from 'next-auth/react';

interface InviteSignOutButtonProps {
  callbackUrl: string;
}

export function InviteSignOutButton({ callbackUrl }: InviteSignOutButtonProps) {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl })}
      className="flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
    >
      Sign out &amp; continue
    </button>
  );
}
