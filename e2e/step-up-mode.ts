/**
 * OZI-220 — `ADMIN_STEP_UP_MODE=bypass-local-only` is refused by the app on
 * any production build (SEC-48, `validateAppSecurityConfigValues`), and
 * `next start` always serves one. Started that way, the E2E server answers
 * every env-reading request with an opaque 500. Refuse the combination before
 * the server starts, with the reason, instead of letting a suite fail far
 * from its cause.
 */
export function assertStepUpModeAllowedForE2EServer(
  env: Readonly<Record<string, string | undefined>>,
  { serveBuild }: { readonly serveBuild: boolean },
): void {
  if (serveBuild && env.ADMIN_STEP_UP_MODE === 'bypass-local-only') {
    throw new Error(
      '[e2e] ADMIN_STEP_UP_MODE=bypass-local-only cannot run against `next start`: a production build refuses the step-up bypass (SEC-48). ' +
        'Run with ADMIN_STEP_UP_MODE=required and pass the real challenge (e2e/authjs-step-up.ts), or use `next dev` locally.',
    );
  }
}
