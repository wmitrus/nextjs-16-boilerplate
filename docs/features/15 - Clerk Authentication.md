# Clerk Authentication

This document details the global integration of **Clerk Authentication** within the boilerplate, ensuring secure access and identity management.

## 1. Overview

Clerk is the primary authentication provider, integrated with **Next.js 16**, **React 19**, and the **App Router**. The implementation focuses on performance (using Suspense), type safety (via T3-Env), and centralized middleware management.

## 2. Setup & Configuration

### Dependencies

- `@clerk/nextjs`: Core SDK for Next.js integration.

### Environment Variables

Managed via [./src/core/env.ts](@/core/env.ts).

| Variable                            | Description                                   |
| ----------------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public key for client-side SDK.               |
| `CLERK_SECRET_KEY`                  | Private key for server-side Backend API.      |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`     | Path to the custom sign-in page (`/sign-in`). |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`     | Path to the custom sign-up page (`/sign-up`). |

## 3. Root Integration

The `ClerkProvider` is the root of the authentication context. In this boilerplate, it is placed inside the Root Layout and wrapped in a `<Suspense>` boundary to comply with Next.js 16 async API requirements.

```tsx
// src/app/layout.tsx
<Suspense fallback={null}>
  <ClerkProvider
    signInUrl={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
    signUpUrl={env.NEXT_PUBLIC_CLERK_SIGN_UP_URL}
    signInFallbackRedirectUrl={
      env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
    }
    signUpFallbackRedirectUrl={
      env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL
    }
  >
    <Header />
    {children}
  </ClerkProvider>
</Suspense>
```

## 4. Middleware & Access Control

Authentication logic is centralized in [./src/proxy.ts](@/proxy.ts). It handles:

- **Public Routes**: Pages accessible to everyone (e.g., Home, Landing).
- **Private Routes**: Enforced via `auth.protect()`.
- **Auth Redirects**: Redirecting signed-in users away from `/sign-in` or `/sign-up`.
- **Onboarding Redirects**: Forcing users to complete onboarding if required.

## 5. Custom Authentication Pages

Custom pages are implemented to maintain brand consistency and avoid redirects to Clerk's hosted portal.

- **Sign In**: [./src/app/sign-in/[[...sign-in]]/page.tsx](@/app/sign-in/[[...sign-in]]/page.tsx)
- **Sign Up**: [./src/app/sign-up/[[...sign-up]]/page.tsx](@/app/sign-up/[[...sign-up]]/page.tsx)

**Key Requirements:**

- Use the `path` prop on `<SignIn />` and `<SignUp />`.
- Wrap components in `<Suspense>` with skeleton fallbacks to prevent hydration mismatches and "Blocking Route" errors.

## 6. UI Components

### Header Integration

The [./src/shared/components/Header.tsx](@/shared/components/Header.tsx) uses Clerk's control components:

- `<SignedIn>`: Content visible only to authenticated users.
- `<SignedOut>`: Content visible only to guests (Sign In/Up buttons).
- `<UserButton>`: User profile management.

**Hydration Safety:**
To prevent SSR mismatches, components that depend on client-side auth state use an `isMounted` hook.

## 7. Error Handling

Development-only warnings (like "single session enabled") are suppressed in the [./src/shared/components/error/global-error-handlers.tsx](@/shared/components/error/global-error-handlers.tsx) to keep the console clean.

## 8. Related Features

- **Onboarding**: For details on the custom onboarding flow, see [02 - Clerk Onboarding.md](@/features/02%20-%20Clerk%20Onboarding.md).
