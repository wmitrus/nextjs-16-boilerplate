import { describe, expect, it } from 'vitest';

import { assertStepUpModeAllowedForE2EServer } from './step-up-mode';

describe('assertStepUpModeAllowedForE2EServer (OZI-220)', () => {
  it('refuses the bypass against a production build', () => {
    expect(() =>
      assertStepUpModeAllowedForE2EServer(
        { ADMIN_STEP_UP_MODE: 'bypass-local-only' },
        { serveBuild: true },
      ),
    ).toThrow(/production build refuses the step-up bypass/);
  });

  it.each([undefined, 'required'])(
    'accepts ADMIN_STEP_UP_MODE=%s against a production build',
    (mode) => {
      expect(() =>
        assertStepUpModeAllowedForE2EServer(
          { ADMIN_STEP_UP_MODE: mode },
          { serveBuild: true },
        ),
      ).not.toThrow();
    },
  );

  it('leaves the local-only bypass to `next dev`', () => {
    expect(() =>
      assertStepUpModeAllowedForE2EServer(
        { ADMIN_STEP_UP_MODE: 'bypass-local-only' },
        { serveBuild: false },
      ),
    ).not.toThrow();
  });
});
