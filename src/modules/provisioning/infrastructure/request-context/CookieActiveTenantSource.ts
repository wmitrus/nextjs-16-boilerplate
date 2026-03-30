import type { ActiveTenantContextSource } from './ActiveTenantContextSource';

/**
 * Reads the active tenant ID from a request cookie.
 * Cookie name is configurable (default: TENANT_CONTEXT_COOKIE env var, e.g. 'active_tenant_id').
 *
 * Priority order when composing with HeaderActiveTenantSource:
 * header > cookie (header takes precedence).
 */
export class CookieActiveTenantSource implements ActiveTenantContextSource {
  constructor(
    private readonly getCookies: () =>
      | Promise<ReadonlyRequestCookies>
      | ReadonlyRequestCookies,
    private readonly cookieName: string,
  ) {}

  async getActiveTenantId(): Promise<string | null> {
    const cookies = await this.getCookies();
    const value = cookies.get(this.cookieName)?.value;
    return value ?? null;
  }
}

type ReadonlyRequestCookies = {
  get(name: string): { value: string } | undefined;
};
