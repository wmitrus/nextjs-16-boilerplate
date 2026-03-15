import { headers } from 'next/headers';

import { env } from '@/core/env';

export interface ServerRequestLogContext {
  readonly correlationId: string;
  readonly requestId: string;
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
      correlationId: headerList.get('x-correlation-id') ?? crypto.randomUUID(),
      requestId: headerList.get('x-request-id') ?? crypto.randomUUID(),
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
      pathname: input?.pathname,
      referer: undefined,
      runtime: resolveRuntime(),
      environment: env.NODE_ENV,
    };
  }
}
