import { headers } from 'next/headers';

import { env } from '@/core/env';

export interface ServerRequestLogContext {
  readonly correlationId: string;
  readonly requestId: string;
  /**
   * Whether the correlation id originated with the caller. Set by the Edge
   * boundary (SEC-46); 'generated' when this context had to mint its own.
   */
  readonly correlationSource: 'external' | 'generated';
  readonly pathname?: string;
  readonly referer?: string;
  readonly runtime: 'edge' | 'node';
  readonly environment: 'development' | 'test' | 'production';
}

function resolveRuntime(): 'edge' | 'node' {
  return typeof process !== 'undefined' && process.release?.name === 'node'
    ? 'node'
    : 'edge';
}

export async function getServerRequestLogContext(input?: {
  pathname?: string;
}): Promise<ServerRequestLogContext> {
  try {
    const headerList = await headers();

    return {
      // Already canonical: the Edge boundary validates the inbound value and
      // overwrites both request headers before the request reaches here
      // (SEC-46), so there is deliberately no second validation in this layer.
      // The fallbacks cover a request that never passed through the proxy.
      correlationId: headerList.get('x-correlation-id') ?? crypto.randomUUID(),
      requestId: headerList.get('x-request-id') ?? crypto.randomUUID(),
      correlationSource:
        headerList.get('x-correlation-source') === 'external'
          ? 'external'
          : 'generated',
      pathname:
        input?.pathname ??
        headerList.get('x-pathname') ??
        headerList.get('next-url') ??
        undefined,
      referer: headerList.get('referer') ?? undefined,
      runtime: resolveRuntime(),
      environment: env.NODE_ENV,
    };
  } catch {
    return {
      correlationId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      correlationSource: 'generated',
      pathname: input?.pathname,
      referer: undefined,
      runtime: resolveRuntime(),
      environment: env.NODE_ENV,
    };
  }
}
