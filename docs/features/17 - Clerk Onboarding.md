# Clerk Onboarding Integration

This document provides a comprehensive guide to the custom onboarding flow implemented using **Clerk Authentication** and **Next.js 16**.

## 1. Prerequisites & Configuration

### Environment Variables

Configure your Clerk keys and redirect paths in [./.env.local](@/.env.local).

```bash
# Clerk Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Custom Routes
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Redirect Logic
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/onboarding
```

### Env Schema

Ensure these are mapped in [./src/core/env.ts](@/core/env.ts) for type-safe access.

```typescript
client: {
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default('/sign-in'),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default('/sign-up'),
  NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL: z.string().default('/onboarding'),
  // ... other variables
}
```

## 2. Global Type Safety

To access custom metadata via `sessionClaims` in Middleware and Server Components, define the `CustomJwtSessionClaims` interface in [./src/types/globals.d.ts](@/types/globals.d.ts).

```typescript
export {};

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      onboardingComplete?: boolean;
      targetLanguage?: string;
      proficiencyLevel?: string;
      learningGoal?: string;
    };
  }
}
```

> **Important**: You must also go to the **Clerk Dashboard > Sessions > Customize session token** and add:
>
> ```json
> { "metadata": "{{user.public_metadata}}" }
> ```

## 3. Middleware (Proxy) Redirection

The [./src/proxy.ts](@/proxy.ts) manages access control and the onboarding redirection loop. To solve "read your writes" staleness after metadata updates, the middleware falls back to `clerkClient` if the JWT is incomplete.

```typescript
export default clerkMiddleware(async (auth, request) => {
  const { userId, sessionClaims } = await auth();

  // 1. Redirect signed-in users away from auth pages
  if (userId && isAuthRoute(request)) {
    let onboardingComplete = sessionClaims?.metadata?.onboardingComplete;
    if (!onboardingComplete) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      onboardingComplete = user.publicMetadata?.onboardingComplete as boolean;
    }
    // ... redirect logic
  }

  // 2. Catch users who do not have `onboardingComplete: true`
  if (userId && !isOnboardingRoute(request)) {
    let onboardingComplete = sessionClaims?.metadata?.onboardingComplete;
    if (!onboardingComplete) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      onboardingComplete = user.publicMetadata?.onboardingComplete as boolean;
    }
    if (!onboardingComplete) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
  }
});
```

## 4. Next.js 16 Root Layout & Suspense

Next.js 16 requires dynamic APIs (like `auth()`) to be handled asynchronously. We use nested `<Suspense>` boundaries to satisfy "Blocking Route" requirements.

```tsx
// src/app/layout.tsx
<Suspense fallback={null}>
  <ClerkProvider ...>
    <Header />
    <Suspense fallback={null}>{children}</Suspense>
  </ClerkProvider>
</Suspense>
```

## 5. Custom Auth Pages

Custom pages must include the `path` prop and be wrapped in `<Suspense>` for stability.

```tsx
// src/app/sign-in/[[...sign-in]]/page.tsx
export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense fallback={<div className="animate-pulse" />}>
        <SignIn path="/sign-in" />
      </Suspense>
    </div>
  );
}
```

## 6. Onboarding Feature

### Onboarding Layout

Prevents users from revisiting onboarding once complete. It uses a `clerkClient` fallback to ensure the redirect happens immediately after the metadata update.

```tsx
// src/app/onboarding/layout.tsx
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();

  let onboardingComplete = sessionClaims?.metadata?.onboardingComplete;
  if (!onboardingComplete && userId) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    onboardingComplete = user.publicMetadata?.onboardingComplete as boolean;
  }

  if (onboardingComplete === true) {
    redirect('/');
  }
  return <div className="container">{children}</div>;
}
```

### Server Action

Securely updates the User object via the Backend API.

```typescript
// src/app/onboarding/_actions.ts
export const completeOnboarding = async (formData: FormData) => {
  const { userId } = await auth();
  const client = await clerkClient();

  await client.users.updateUser(userId, {
    publicMetadata: {
      onboardingComplete: true,
      targetLanguage: formData.get('targetLanguage'),
      // ... fields
    },
  });
  return { message: 'Onboarding completed' };
};
```

### Onboarding Page

Handles form submission and forces a client-side session refresh.

```tsx
// src/app/onboarding/page.tsx
const handleSubmit = async (formData: FormData) => {
  const res = await completeOnboarding(formData);
  if (res?.message) {
    await user?.reload(); // CRITICAL: Refreshes sessionClaims in the browser
    router.push('/');
  }
};
```

## 7. Hydration & Error Handling

### Header Component

To prevent hydration errors in the Header (where `SignedIn`/`SignedOut` buttons render), use an `isMounted` state.

```tsx
const [isMounted, setIsMounted] = React.useState(false);
React.useEffect(() => setIsMounted(true), []);

if (!isMounted) return null; // Or skeleton
```

### Global Error Suppression

Clerk logs a development-only "no-op" warning if a user is already signed in. We suppress this in [./src/shared/components/error/global-error-handlers.tsx](@/shared/components/error/global-error-handlers.tsx).

```typescript
if (message.includes('cannot_render_single_session_enabled')) {
  return;
}
```
