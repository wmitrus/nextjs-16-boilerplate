import type { NextRequest, NextResponse } from 'next/server';
import { vi } from 'vitest';

import type { NodeProvisioningAccessAllowed } from '@/security/core/node-provisioning-access';

/**
 * Pass-through double for the admin step-up guard (SEC-48).
 *
 * Import it from a route test whose subject is the route's *authorization*
 * and data behaviour -- scope predicates, validation, audit events -- so the
 * test does not also have to mint a valid proof and configure key material.
 *
 * Step-up itself is covered where it lives: `with-admin-step-up.test.ts` for
 * the enforcement logic, `with-admin-step-up.guard.test.ts` for the static
 * deny-by-default rule over `/api/admin/**`, and the E2E step-up spec for the
 * real challenge-and-proof round trip. Mocking it here removes duplication,
 * not coverage.
 *
 * Deliberately *not* wired into the global test setup: a route test must opt
 * in, so that reading the test tells you the guard was stubbed.
 */

type RouteHandlerContext = {
  params: Promise<Record<string, string | string[]>>;
};

type GuardedRouteHandler = (
  request: NextRequest,
  context: RouteHandlerContext,
  access: NodeProvisioningAccessAllowed,
) => Promise<NextResponse> | NextResponse;

export const mockWithAdminStepUp = vi.fn(
  (handler: GuardedRouteHandler) => handler,
);

vi.mock('@/security/api/with-admin-step-up', () => ({
  withAdminStepUp: (handler: GuardedRouteHandler) =>
    mockWithAdminStepUp(handler),
}));
