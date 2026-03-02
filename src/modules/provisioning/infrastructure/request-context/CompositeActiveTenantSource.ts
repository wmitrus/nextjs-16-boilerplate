import type { ActiveTenantContextSource } from './ActiveTenantContextSource';

/**
 * Composite source that tries multiple sources in priority order.
 * First non-null result wins. Default priority: header > cookie.
 */
export class CompositeActiveTenantSource implements ActiveTenantContextSource {
  constructor(private readonly sources: ActiveTenantContextSource[]) {}

  async getActiveTenantId(): Promise<string | null> {
    for (const source of this.sources) {
      const id = await source.getActiveTenantId();
      if (id) return id;
    }
    return null;
  }
}
