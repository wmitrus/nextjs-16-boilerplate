# Clerk Waitlist Integration

This document details the implementation of **Waitlist Mode** using **Clerk Authentication** and **Next.js 16**, allowing users to register interest before full access is granted.

## 1. Prerequisites & Configuration

### Clerk Dashboard

1. Navigate to the **Waitlist** page in the Clerk Dashboard.
2. Toggle on **Enable waitlist** and select **Save**.
3. (Optional) Customize the Waitlist email templates.

### Environment Variables

Configure the waitlist URL in [./.env.example](@/.env.example) and your local `.env` file.

```bash
NEXT_PUBLIC_CLERK_WAITLIST_URL=/waitlist
```

### Env Schema

Mapped in [./src/core/env.ts](@/core/env.ts) for type-safe access.

```typescript
client: {
  NEXT_PUBLIC_CLERK_WAITLIST_URL: z.string().default('/waitlist'),
}
```

## 2. Global Provider Setup

The `waitlistUrl` must be provided to the `ClerkProvider` in the Root Layout to ensure proper redirection when users attempt to access protected areas while Waitlist mode is active.

```tsx
// src/app/layout.tsx
<ClerkProvider
  signInUrl={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
  signUpUrl={env.NEXT_PUBLIC_CLERK_SIGN_UP_URL}
  waitlistUrl={env.NEXT_PUBLIC_CLERK_WAITLIST_URL}
  // ... redirects
>
  {/* children */}
</ClerkProvider>
```

## 3. Middleware (Proxy) Configuration

The `/waitlist` route must be marked as a public route in [./src/proxy.ts](@/proxy.ts) to allow unauthenticated users to join the waitlist.

```typescript
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/waitlist(.*)', // Added to public routes
  '/',
]);
```

## 4. Waitlist Page

A dedicated page is implemented to host the Clerk `<Waitlist />` component. It uses `<Suspense>` to prevent hydration mismatches during dynamic auth state checks.

```tsx
// src/app/waitlist/page.tsx
import { Waitlist } from '@clerk/nextjs';
import { Suspense } from 'react';

export default function WaitlistPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense
        fallback={
          <div className="h-[400px] w-[400px] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        }
      >
        <Waitlist />
      </Suspense>
    </div>
  );
}
```

## 5. Behavior in Waitlist Mode

When Waitlist mode is enabled in the Clerk Dashboard:

- **<SignIn />**: Only accessible to users who have been approved from the waitlist.
- **<SignUp />**: Only accessible to users who have been invited via a valid invitation link.
- **Unapproved Users**: Attempting to sign up or sign in without approval will automatically redirect users to the `waitlistUrl`.

## 6. Related Features

- **Authentication**: For general auth setup, see [15 - Clerk Authentication.md](@/features/15%20-%20Clerk%20Authentication.md).
- **Onboarding**: For post-registration flow, see [02 - Clerk Onboarding.md](@/features/02%20-%20Clerk%20Onboarding.md).
