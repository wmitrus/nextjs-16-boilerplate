export function buildInviteReturnPath(token: string): string {
  return `/auth/invite/${encodeURIComponent(token)}`;
}

export function buildInviteSignUpUrl(
  token: string,
  provider: 'authjs' | 'clerk',
): string {
  const encodedToken = encodeURIComponent(token);

  return provider === 'authjs'
    ? `/auth/signup?invitation_token=${encodedToken}`
    : `/sign-up?invitation_token=${encodedToken}`;
}

export function buildInviteSignInUrl(
  token: string,
  provider: 'authjs' | 'clerk',
): string {
  const returnPath = buildInviteReturnPath(token);

  if (provider === 'authjs') {
    return `/auth/signin?${new URLSearchParams({ callbackUrl: returnPath }).toString()}`;
  }

  return `/sign-in?${new URLSearchParams({ redirect_url: returnPath }).toString()}`;
}
