/**
 * @vitest-environment node
 *
 * Coverage for secureFetch's connection-pinning wiring: proof that the
 * exact address `resolveAndValidateHost` validates is the exact address
 * handed to the underlying connector for the real TCP/TLS connect — not
 * just that the allow/deny decision is correct (secure-fetch.test.ts
 * already covers that with a mocked `global.fetch`, which can't see this).
 *
 * This mocks `undici`'s `Agent` to capture the `connect.lookup` function
 * secureFetch builds per hop, then calls that function the same way
 * `net.connect` would and asserts on what it resolves to. A real end-to-end
 * socket test isn't practical here: our own private-address check
 * correctly rejects loopback/127.0.0.1, which is the only address this
 * sandbox could actually bind a test server to — so proving the wiring
 * directly is both more honest and more precise than fighting that check.
 * (The underlying undici connect.lookup mechanism itself — that a custom
 * lookup genuinely redirects the real socket, independent of any DNS
 * record for the hostname — was verified manually against a real local
 * server before this was written; see SEC-28's secure-fetch entry in
 * docs/ai/general/SECURITY_CODING_PATTERNS.md.)
 */
import '@/testing/infrastructure/env';
import '@/testing/infrastructure/logger';

import { lookup } from 'node:dns/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { secureFetch } from './secure-fetch';

import { mockEnv, resetAllInfrastructureMocks } from '@/testing';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

interface MockAgentInstance {
  options: {
    connect: {
      lookup: (
        hostname: string,
        options: { all?: boolean },
        callback: (err: Error | null, result: unknown) => void,
      ) => void;
    };
  };
  close: ReturnType<typeof vi.fn>;
}

const { agentInstances } = vi.hoisted(() => ({
  agentInstances: [] as MockAgentInstance[],
}));

vi.mock('undici', () => {
  class MockAgent {
    options: MockAgentInstance['options'];
    close = vi.fn().mockResolvedValue(undefined);

    constructor(options: MockAgentInstance['options']) {
      this.options = options;
      agentInstances.push(this as unknown as MockAgentInstance);
    }
  }
  return { Agent: MockAgent };
});

/** Invokes a captured Agent's `connect.lookup` the way net.connect does. */
function resolvePinnedAddresses(
  agent: MockAgentInstance,
): Promise<{ address: string; family: number }[]> {
  return new Promise((resolve, reject) => {
    agent.options.connect.lookup(
      'irrelevant-hostname',
      { all: true },
      (err, result) => {
        if (err) reject(err);
        else resolve(result as { address: string; family: number }[]);
      },
    );
  });
}

describe('secureFetch — connection pinning wiring', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
    agentInstances.length = 0;
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = 'example.com, trusted.org';
  });

  it('pins the connector to exactly the address resolveAndValidateHost validated', async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
    ] as unknown as Awaited<ReturnType<typeof lookup>>);
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await secureFetch('https://example.com/api');

    expect(agentInstances).toHaveLength(1);
    await expect(resolvePinnedAddresses(agentInstances[0])).resolves.toEqual([
      { address: '93.184.216.34', family: 4 },
    ]);
    expect(agentInstances[0].close).toHaveBeenCalledTimes(1);
  });

  it('pins each redirect hop to its own independently-resolved address, never reusing an earlier hop', async () => {
    vi.mocked(lookup)
      .mockResolvedValueOnce([
        { address: '93.184.216.34', family: 4 },
      ] as unknown as Awaited<ReturnType<typeof lookup>>) // example.com
      .mockResolvedValueOnce([
        // A genuinely public address, distinct from hop 1's -- 203.0.113.0/24
        // (used here previously) is RFC 5737's TEST-NET-3, a
        // documentation-only range A.8.1's default-deny classifier
        // correctly rejects, which broke this test for an unrelated reason
        // once that range gained coverage.
        { address: '1.1.1.1', family: 4 },
      ] as unknown as Awaited<ReturnType<typeof lookup>>); // trusted.org

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://trusted.org/final' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await secureFetch('https://example.com/start');

    expect(agentInstances).toHaveLength(2);
    const [hop1, hop2] = await Promise.all(
      agentInstances.map((agent) => resolvePinnedAddresses(agent)),
    );
    expect(hop1).toEqual([{ address: '93.184.216.34', family: 4 }]);
    expect(hop2).toEqual([{ address: '1.1.1.1', family: 4 }]);
    expect(agentInstances[0].close).toHaveBeenCalledTimes(1);
    expect(agentInstances[1].close).toHaveBeenCalledTimes(1);
  });
});
