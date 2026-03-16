import { isValidInternalRedirect } from '@/shared/lib/routing/safe-redirect';

function parseUrlOrThrow(url: string, label: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new Error(`${label} must be a valid absolute URL.`);
  }
}

export function normalizeClerkPostAuthRedirect(
  target: string | undefined,
  appUrl: string | undefined,
): string | undefined {
  if (!target) {
    return undefined;
  }

  if (!appUrl) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL is required when Clerk post-auth redirect URLs are configured.',
    );
  }

  const appBaseUrl = parseUrlOrThrow(appUrl, 'NEXT_PUBLIC_APP_URL');

  if (target.startsWith('http://') || target.startsWith('https://')) {
    const absoluteTargetUrl = parseUrlOrThrow(
      target,
      'Clerk post-auth redirect URL',
    );

    if (absoluteTargetUrl.origin !== appBaseUrl.origin) {
      throw new Error(
        'Clerk post-auth redirect URLs must stay on NEXT_PUBLIC_APP_URL origin.',
      );
    }

    return absoluteTargetUrl.toString();
  }

  if (!isValidInternalRedirect(target)) {
    throw new Error(
      'Clerk post-auth redirect URLs must be internal paths or same-origin absolute URLs.',
    );
  }

  return new URL(target, appBaseUrl).toString();
}
