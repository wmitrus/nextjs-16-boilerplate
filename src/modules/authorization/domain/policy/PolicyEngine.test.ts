import { describe, expect, it, vi } from 'vitest';

import type {
  AuthorizationContext,
  Policy,
} from '@/core/contracts/repositories';

import { PolicyEngine } from './PolicyEngine';

describe('PolicyEngine', () => {
  const mockContext: AuthorizationContext = {
    tenant: { tenantId: 't1' },
    subject: { id: 'u1' },
    resource: { type: 'document', id: 'd1' },
    action: 'document:read',
  };

  const engine = new PolicyEngine();

  it('should deny if no policies are provided', async () => {
    const result = await engine.evaluate(mockContext, []);
    expect(result).toBe(false);
  });

  it('should allow if an allow policy matches', async () => {
    const policies: Policy[] = [
      {
        effect: 'allow',
        actions: ['document:read'],
        resource: 'document',
      },
    ];
    const result = await engine.evaluate(mockContext, policies);
    expect(result).toBe(true);
  });

  it('should deny if a deny policy matches (deny-overrides)', async () => {
    const policies: Policy[] = [
      {
        effect: 'allow',
        actions: ['document:read'],
        resource: 'document',
      },
      {
        effect: 'deny',
        actions: ['document:read'],
        resource: 'document',
      },
    ];
    const result = await engine.evaluate(mockContext, policies);
    expect(result).toBe(false);
  });

  it('should support conditional policies', async () => {
    const policies: Policy[] = [
      {
        effect: 'allow',
        actions: ['document:read'],
        resource: 'document',
        condition: (ctx) => ctx.subject.id === 'u1',
      },
    ];

    const result = await engine.evaluate(mockContext, policies);
    expect(result).toBe(true);

    const result2 = await engine.evaluate(
      { ...mockContext, subject: { id: 'u2' } },
      policies,
    );
    expect(result2).toBe(false);
  });

  it('should support async conditions', async () => {
    const policies: Policy[] = [
      {
        effect: 'allow',
        actions: ['document:read'],
        resource: 'document',
        condition: async (ctx) => {
          return new Promise((resolve) => {
            setTimeout(() => resolve(ctx.subject.id === 'u1'), 10);
          });
        },
      },
    ];

    const result = await engine.evaluate(mockContext, policies);
    expect(result).toBe(true);
  });

  it('should ignore policies with non-matching action', async () => {
    const condition = vi.fn(() => true);
    const policies: Policy[] = [
      {
        effect: 'allow',
        actions: ['document:update'],
        resource: 'document',
        condition,
      },
    ];

    const result = await engine.evaluate(mockContext, policies);
    expect(result).toBe(false);
    expect(condition).not.toHaveBeenCalled();
  });

  it('should ignore policies with non-matching resource', async () => {
    const condition = vi.fn(() => true);
    const policies: Policy[] = [
      {
        effect: 'allow',
        actions: ['document:read'],
        resource: 'invoice',
        condition,
      },
    ];

    const result = await engine.evaluate(mockContext, policies);
    expect(result).toBe(false);
    expect(condition).not.toHaveBeenCalled();
  });
});
