import type { NextRequest } from 'next/server';
import { vi } from 'vitest';

import type { RouteContext } from './route-classification';

/**
 * Domain-specific mock factory for RouteContext.
 * Co-located next to implementation for strict encapsulation.
 */
export function createMockRouteContext(
  overrides: Partial<RouteContext> = {},
): RouteContext {
  return {
    isApi: false,
    isWebhook: false,
    isInternalApi: false,
    isAuthRoute: false,
    isOnboardingRoute: false,
    isPublicRoute: false,
    isStaticFile: false,
    correlationId: 'test-correlation-id',
    requestId: 'test-request-id',
    ...overrides,
  };
}

export const mockClassifyRequest = vi.fn<(req: NextRequest) => RouteContext>();

export function resetRouteClassificationMocks() {
  mockClassifyRequest.mockReset();
}

vi.mock('./route-classification', () => ({
  classifyRequest: (req: NextRequest) => mockClassifyRequest(req),
}));
