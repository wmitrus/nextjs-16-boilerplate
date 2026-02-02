import { SignUp } from '@clerk/nextjs';
import { Suspense } from 'react';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense
        fallback={
          <div className="h-[600px] w-[400px] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        }
      >
        <SignUp path="/sign-up" />
      </Suspense>
    </div>
  );
}
