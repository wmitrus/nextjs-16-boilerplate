'use client';

import * as React from 'react';

interface InviteMemberFormProps {
  organizationId?: string;
  roles: Array<{ id: string; name: string }>;
  onSuccess?: (email: string) => void;
}

interface FormState {
  status: 'idle' | 'submitting' | 'success' | 'error';
  errorMessage?: string;
  lastEmail?: string;
}

/**
 * Invite member form — calls POST /api/auth/invite.
 * Renders as a standalone client component; embed in organization settings.
 */
export function InviteMemberForm({ roles, onSuccess }: InviteMemberFormProps) {
  const [email, setEmail] = React.useState('');
  const [roleId, setRoleId] = React.useState(roles[0]?.id ?? '');
  const [state, setState] = React.useState<FormState>({ status: 'idle' });

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submittedEmail = email;
    setState({ status: 'submitting' });

    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, roleId }),
      });

      if (!res.ok) {
        let errorMessage = 'Failed to send invitation';

        try {
          const data = (await res.json()) as { error?: string };
          errorMessage = data.error ?? errorMessage;
        } catch {
          const fallbackText = await res.text().catch(() => '');
          errorMessage = fallbackText.trim()
            ? fallbackText.trim()
            : res.status || res.statusText
              ? `Request failed: ${res.status} ${res.statusText}`.trim()
              : errorMessage;
        }

        setState({
          status: 'error',
          errorMessage,
        });
        return;
      }

      setState({ status: 'success', lastEmail: submittedEmail });
      setEmail('');
      onSuccess?.(submittedEmail);
    } catch {
      setState({
        status: 'error',
        errorMessage: 'Network error. Please try again.',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="invite-email"
          className="block text-sm font-medium text-gray-700"
        >
          Email address
        </label>
        <input
          id="invite-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@example.com"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-1 focus:ring-black focus:outline-none disabled:opacity-50"
          disabled={state.status === 'submitting'}
        />
      </div>

      {roles.length > 1 && (
        <div>
          <label
            htmlFor="invite-role"
            className="block text-sm font-medium text-gray-700"
          >
            Role
          </label>
          <select
            id="invite-role"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-1 focus:ring-black focus:outline-none disabled:opacity-50"
            disabled={state.status === 'submitting'}
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {state.status === 'error' && (
        <p className="text-sm text-red-600">{state.errorMessage}</p>
      )}

      {state.status === 'success' && (
        <p className="text-sm text-green-600">
          Invitation sent to {state.lastEmail}
        </p>
      )}

      <button
        type="submit"
        disabled={state.status === 'submitting' || !email || !roleId}
        className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {state.status === 'submitting' ? 'Sending…' : 'Send Invitation'}
      </button>
    </form>
  );
}
