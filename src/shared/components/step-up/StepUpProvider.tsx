'use client';

import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { Dialog } from '@/shared/components/ui/dialog';
import { extractApiErrorMessage } from '@/shared/lib/api/extract-error-message';

/**
 * Client-side plumbing for the step-up challenge (SEC-48).
 *
 * The server is the only authority here: it refuses a mutation with
 * `STEP_UP_REQUIRED`, and this provider turns that refusal into a prompt and
 * a single retry. Nothing on the client decides *whether* a challenge is
 * needed -- a client that guessed would either nag when the proof is still
 * fresh or, worse, teach users to expect a prompt at moments the server
 * never asked for one.
 *
 * `stepUpFetch` is a drop-in for `fetch` inside the admin panel: same
 * signature, and it replays the original request unchanged once a proof has
 * been obtained.
 */

type StepUpFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const StepUpContext = createContext<StepUpFetch | null>(null);

interface ApiErrorBody {
  code?: string;
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as ApiErrorBody;
    return typeof body.code === 'string' ? body.code : undefined;
  } catch {
    return undefined;
  }
}

type ChallengeState =
  | { kind: 'idle' }
  | { kind: 'open'; resolve: (satisfied: boolean) => void }
  | { kind: 'enrollment-required'; enrollmentUrl: string };

export function StepUpProvider({ children }: { children: ReactNode }) {
  const [challenge, setChallenge] = useState<ChallengeState>({ kind: 'idle' });

  const requestProof = useCallback(async (): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setChallenge({ kind: 'open', resolve });
    });
  }, []);

  const stepUpFetch = useCallback<StepUpFetch>(
    async (input, init) => {
      const response = await fetch(input, init);
      if (response.status !== 403) return response;

      const code = await readErrorCode(response);

      if (code === 'MFA_ENROLLMENT_REQUIRED') {
        setChallenge({
          kind: 'enrollment-required',
          enrollmentUrl: '/account/security/mfa?reason=admin',
        });
        return response;
      }

      if (code !== 'STEP_UP_REQUIRED') return response;

      const satisfied = await requestProof();
      if (!satisfied) return response;

      // Exactly one retry. Looping would turn an expired proof or a
      // misconfigured environment into an unbounded prompt cycle.
      return fetch(input, init);
    },
    [requestProof],
  );

  const value = useMemo(() => stepUpFetch, [stepUpFetch]);

  return (
    <StepUpContext value={value}>
      {children}
      {challenge.kind === 'open' && (
        <StepUpDialog
          onResolved={(satisfied) => {
            challenge.resolve(satisfied);
            setChallenge({ kind: 'idle' });
          }}
        />
      )}
      {challenge.kind === 'enrollment-required' && (
        <EnrollmentRequiredDialog
          enrollmentUrl={challenge.enrollmentUrl}
          onDismiss={() => setChallenge({ kind: 'idle' })}
        />
      )}
    </StepUpContext>
  );
}

/**
 * Returns a `fetch` that survives a step-up refusal.
 *
 * Outside a `StepUpProvider` it falls back to plain `fetch`: the server still
 * refuses the mutation, so the failure mode is an error the user can see
 * rather than a silently unprotected call.
 */
export function useStepUpFetch(): StepUpFetch {
  const contextFetch = use(StepUpContext);
  return contextFetch ?? fetch;
}

function StepUpDialog({
  onResolved,
}: {
  onResolved: (satisfied: boolean) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/step-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (response.ok) {
        onResolved(true);
        return;
      }

      const body: unknown = await response.json();
      setError(extractApiErrorMessage(body) ?? 'That code is not valid.');
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      title="Confirm it's you"
      description="This action needs a fresh check. Enter the current code from your authenticator app, or one of your recovery codes."
    >
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        className="space-y-4"
      >
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div>
          <label
            htmlFor="step-up-code"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Authentication code
          </label>
          <input
            id="step-up-code"
            name="code"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onResolved(false)}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || code.trim().length === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Verifying…' : 'Verify'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function EnrollmentRequiredDialog({
  enrollmentUrl,
  onDismiss,
}: {
  enrollmentUrl: string;
  onDismiss: () => void;
}) {
  return (
    <Dialog
      title="Two-factor authentication required"
      description="Administrative changes require a second factor on your account. Set one up, then try again."
    >
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Not now
        </button>
        <a
          href={enrollmentUrl}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Set up two-factor authentication
        </a>
      </div>
    </Dialog>
  );
}
