import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { vi } from 'vitest';

import type { Identity } from '@/core/contracts/identity';
import type { TenantContext } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';

import type { RouteContext } from './route-classification';

import type {
  EdgeSecurityDependencies,
  NodeSecurityDependencies,
} from '@/security/core/security-dependencies';

type MockWithAuthNodeOptions = {
  dependencies: NodeSecurityDependencies;
  userRepository: UserRepository;
  enforceResourceAuthorization?: true;
  resolveIdentity?: () => Promise<Identity | null>;
  resolveTenant?: (identity: Identity) => Promise<TenantContext>;
};

type MockWithAuthEdgeOptions = {
  dependencies: EdgeSecurityDependencies;
  userRepository?: never;
  enforceResourceAuthorization?: false;
  resolveIdentity?: () => Promise<Identity | null>;
  resolveTenant?: (identity: Identity) => Promise<TenantContext>;
};

export const mockWithAuth = vi.fn<
  (req: NextRequest, ctx: RouteContext) => Promise<NextResponse | null>
>((_req, _ctx) => Promise.resolve(null));

export function resetWithAuthMocks() {
  mockWithAuth.mockReset();
  mockWithAuth.mockResolvedValue(null);
}

vi.mock('./with-auth', () => ({
  withAuth:
    (
      _handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
      _options: MockWithAuthNodeOptions | MockWithAuthEdgeOptions,
    ) =>
    (req: NextRequest, ctx: RouteContext) =>
      mockWithAuth(req, ctx),
}));
