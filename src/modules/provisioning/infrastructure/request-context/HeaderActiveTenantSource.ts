import type { ActiveTenantContextSource } from './ActiveTenantContextSource';

/**
 * Reads the active tenant ID from a request header.
 * Header name is configurable (default: TENANT_CONTEXT_HEADER env var, e.g. 'x-tenant-id').
 */
export class HeaderActiveTenantSource implements ActiveTenantContextSource {
  constructor(
    private readonly getHeaders: () => Promise<Headers> | Headers,
    private readonly headerName: string,
  ) {}

  async getActiveTenantId(): Promise<string | null> {
    const headers = await this.getHeaders();
    const value = headers.get(this.headerName);
    return value ?? null;
  }
}
