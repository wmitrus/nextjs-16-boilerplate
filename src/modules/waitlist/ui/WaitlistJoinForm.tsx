'use client';

import * as React from 'react';

interface WaitlistJoinFormProps {
  onSuccess?: (email: string) => void;
}

interface FormState {
  status: 'idle' | 'submitting' | 'success' | 'error' | 'duplicate';
  errorMessage?: string;
  email?: string;
}

/**
 * Provider-agnostic waitlist join form.
 * Used when AUTH_PROVIDER !== 'clerk' and REGISTRATION_MODE=invite-only.
 */
export function WaitlistJoinForm({ onSuccess }: WaitlistJoinFormProps) {
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [state, setState] = React.useState<FormState>({ status: 'idle' });

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submittedEmail = email;
    setState({ status: 'submitting' });

    try {
      const res = await fetch('/api/auth/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || undefined }),
      });

      if (res.status === 409) {
        setState({ status: 'duplicate', email: submittedEmail });
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setState({
          status: 'error',
          errorMessage: data.error ?? 'Failed to join waitlist',
        });
        return;
      }

      setState({ status: 'success', email: submittedEmail });
      setEmail('');
      setName('');
      onSuccess?.(submittedEmail);
    } catch {
      setState({
        status: 'error',
        errorMessage: 'Network error. Please try again.',
      });
    }
  };

  if (state.status === 'success') {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">
          You&apos;re on the list!
        </h2>
        <p className="mt-2 text-gray-600">
          We&apos;ll email {state.email} when your spot is ready.
        </p>
      </div>
    );
  }

  if (state.status === 'duplicate') {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">
          Already registered
        </h2>
        <p className="mt-2 text-gray-600">
          {state.email} is already on the waitlist. We&apos;ll be in touch soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div>
        <label
          htmlFor="waitlist-name"
          className="block text-sm font-medium text-gray-700"
        >
          Name <span className="text-gray-400">(optional)</span>
        </label>
        <input
          id="waitlist-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-1 focus:ring-black focus:outline-none disabled:opacity-50"
          disabled={state.status === 'submitting'}
        />
      </div>

      <div>
        <label
          htmlFor="waitlist-email"
          className="block text-sm font-medium text-gray-700"
        >
          Email address
        </label>
        <input
          id="waitlist-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-1 focus:ring-black focus:outline-none disabled:opacity-50"
          disabled={state.status === 'submitting'}
        />
      </div>

      {state.status === 'error' && (
        <p className="text-sm text-red-600">{state.errorMessage}</p>
      )}

      <button
        type="submit"
        disabled={state.status === 'submitting' || !email}
        className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {state.status === 'submitting' ? 'Joining…' : 'Join Waitlist'}
      </button>
    </form>
  );
}
