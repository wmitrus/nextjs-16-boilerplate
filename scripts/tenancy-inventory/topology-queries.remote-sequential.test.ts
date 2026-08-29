import { describe, expect, it, vi } from 'vitest';

import { DATA_STATEMENTS } from './query-registry';
import { collectRemoteInventoryFindingsSequential } from './topology-queries';

describe('collectRemoteInventoryFindingsSequential', () => {
  it('does not invoke a later frozen registry statement until the preceding statement resolves', async () => {
    let releaseFirst!: () => void;
    const first = new Promise<Record<string, string>[]>((resolve) => {
      releaseFirst = () => {
        resolve([]);
      };
    });
    const execute = vi.fn().mockReturnValueOnce(first).mockResolvedValue([]);

    const pending = collectRemoteInventoryFindingsSequential({
      execute,
    } as never);

    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(1);

    releaseFirst();
    await pending;

    expect(execute).toHaveBeenCalledTimes(DATA_STATEMENTS.length);
  });
});
