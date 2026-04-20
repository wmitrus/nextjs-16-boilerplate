# Validation Review — AuthJS Adapter Implementation

## Task

Validation strategy for the Auth.js (next-auth v5) adapter implementation across six phases.

## Mode

**Change Validation** — determining minimum safe validation scope for each implementation phase.

## Validation Objective

Validate that:

1. `AuthJsRequestIdentitySource` correctly maps Auth.js session data to `RequestIdentitySourceData`
2. `AuthJsEdgeIdentitySource` correctly maps session data in the edge context
3. The route handler is correctly wired and dynamically rendered
4. The UI components respond correctly to authenticated/unauthenticated state
5. The full sign-in → bootstrap → app flow works end-to-end
6. Existing Clerk adapter tests remain green (no regression)
7. `TENANCY_MODE=personal` and `org+db` work with AuthJS

## Current Validation Surfaces

Verified in code:

- Unit tests: Vitest (`pnpm test`) — `src/**/*.test.{ts,tsx}`
- Integration tests: Vitest integration config (`pnpm test:integration`) — `src/**/*.integration.test.{ts,tsx}`
- E2E: Playwright (`pnpm e2e`) — `e2e/**/*.spec.ts`
- Typecheck: `pnpm typecheck` (tsc --noEmit)
- Lint: `pnpm lint --fix` (ESLint flat config)
- Storybook tests: `pnpm test:storybook`

Existing auth-related tests:

- `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.test.ts` — currently only tests the "throws not implemented" stub
- `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.test.ts` — must remain green
- `src/modules/auth/infrastructure/RequestScopedIdentityProvider.test.ts`
- `src/modules/auth/infrastructure/RequestScopedTenantResolver.test.ts`
- `src/modules/auth/edge.test.ts`
- `src/modules/auth/index.test.ts`

## Risk Areas

| Risk Area                                                             | Level  | Reason                                                   |
| --------------------------------------------------------------------- | ------ | -------------------------------------------------------- |
| `emailVerified` claim mapping                                         | HIGH   | Wrong mapping breaks cross-provider email linking policy |
| `userId` mapping from `token.sub`                                     | HIGH   | Missing `userId` causes provisioning failure             |
| `auth.config.ts` Edge safety                                          | HIGH   | Node-only imports crash edge runtime at startup          |
| `await connection()` in route handler                                 | HIGH   | Missing → cache error under `cacheComponents: true`      |
| `AuthJsEdgeIdentitySource` vs `AuthJsRequestIdentitySource` confusion | HIGH   | Using Node source in Edge crashes proxy                  |
| Session cookie security                                               | MEDIUM | Default Auth.js config is secure; don't weaken it        |
| CSRF in sign-in form                                                  | MEDIUM | Auth.js handles this; must not be bypassed               |
| Existing Clerk tests regression                                       | MEDIUM | Any shared code change could affect Clerk path           |

## Validation-Risk Assessment

### Phase 1: Package + Config + Identity Source

**Highest risk phase.** The identity source mapping is the core integration point.

Current test for `AuthJsRequestIdentitySource` only validates the stub error. After implementation, the test must be replaced with:

- Successful session → correct `userId`, `email`, `emailVerified` mapping
- No session (unauthenticated) → `userId: undefined`, `email: undefined`
- Session with missing email → `email: undefined`, logged warning
- `emailVerified` mapping per provider type

This is unit-testable by mocking `auth()` from `auth.ts`.

### Phase 3: UI Components

React component testing for:

- `AuthJsHeaderAuthControls` with authenticated session → shows user email/avatar + sign-out
- `AuthJsHeaderAuthControls` with unauthenticated session → shows sign-in button

These are client components using `useSession()` — mockable with `SessionProvider` test wrapper.

### Phase 4: Sign-in Flow (Highest E2E Risk)

The complete sign-in → bootstrap → app flow is auth-critical and cannot be reliably closed with unit tests alone. This is where E2E testing adds genuine value.

### Regression Risk

Changes to `src/modules/auth/edge.ts` (adding `AuthJsEdgeIdentitySource` to the `authjs` case) affect the edge module factory for all providers. Must verify:

- `clerk` case still creates `ClerkRequestIdentitySource`
- `supabase` still creates `SupabaseRequestIdentitySource`
- `neon` still creates `NeonRequestIdentitySource`

## Minimum Required Validation

### Phase 1 (Minimum — must pass before any UI work)

**Unit tests** (`pnpm test`):

- [ ] `AuthJsRequestIdentitySource.test.ts` — replace stub test with:
  - Authenticated session → correct mapping (userId, email, emailVerified: true for GitHub)
  - Unauthenticated (null session) → all fields undefined
  - Session with missing email → email undefined
  - emailVerified: false for Credentials provider
- [ ] `AuthJsEdgeIdentitySource.test.ts` — new test file, same mapping tests (edge variant)
- [ ] `src/modules/auth/edge.test.ts` — verify `authjs` case creates `AuthJsEdgeIdentitySource` (not `AuthJsRequestIdentitySource`)

**Typecheck** (`pnpm typecheck`):

- [ ] Must pass with zero errors

**Lint** (`pnpm lint --fix`):

- [ ] Must pass with zero errors

**Regression** (`pnpm test`):

- [ ] Existing Clerk adapter tests remain green
- [ ] `src/modules/auth/edge.test.ts` — existing cases for `clerk`, `supabase`, `neon` remain green

### Phase 2 (Edge Proxy + OAuth)

**Integration test** (manual dev verification is acceptable for this phase):

- [ ] Start dev server with `AUTH_PROVIDER=authjs`, `AUTH_SECRET` set
- [ ] Verify sign-in redirect goes to `/sign-in`
- [ ] Verify unauthenticated access to a protected route redirects correctly

**No new unit tests needed** for the proxy change — it's wiring only.

### Phase 3 (UI Components)

**Unit/component tests** (`pnpm test`):

- [ ] `AuthJsHeaderAuthControls.test.tsx` — authenticated state shows user email, unauthenticated shows sign-in button
- [ ] `AuthJsSessionProvider.test.tsx` — renders children (smoke test only)

**Storybook stories** (`pnpm test:storybook`) — optional but recommended:

- [ ] Story for `AuthJsHeaderAuthControls` in signed-in state
- [ ] Story for `AuthJsHeaderAuthControls` in signed-out state

### Phase 4 (Sign-in Pages)

**E2E tests** (`pnpm e2e`) — **required for this phase**:

- [ ] Unauthenticated user accessing protected route → redirected to `/sign-in`
- [ ] Sign-in page renders without error boundary
- [ ] Sign-in page title is correct
- [ ] OAuth button(s) visible on sign-in page
- [ ] (Credentials) form inputs present and functional

Note: Full OAuth flow testing in Playwright requires a real OAuth app setup. For the boilerplate E2E suite, the Credentials provider can be used for automated testing (no external OAuth callback needed).

### Phase 5 (Tenancy Integration)

**No new tests needed** if existing provisioning tests cover personal and org+db modes.

Manual verification:

- [ ] `TENANCY_MODE=personal`, `AUTH_PROVIDER=authjs` — sign in → bootstrap → personal tenant resolved
- [ ] `TENANCY_MODE=org+db`, `AUTH_PROVIDER=authjs` — tenant from header/cookie context works

### Phase 6 (Test Completion)

- [ ] `pnpm test` — all unit tests green
- [ ] `pnpm test:integration` — integration tests green
- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm lint --fix` — zero errors
- [ ] `pnpm e2e` — AuthJS auth flow E2E spec passes

## Optional Additional Validation

- **Integration test for full provisioning flow**: `AuthJsRequestIdentitySource` → `RequestScopedIdentityProvider` → `DrizzleInternalIdentityLookup` — would give confidence that the full chain works with a test DB. Not strictly required if unit tests cover the mapping correctly.
- **Storybook stories** for `AuthJsHeaderAuthControls` — useful for visual regression but not blocking.
- **Auth.js route handler integration test** using `msw` — could mock the Auth.js API endpoints for testing. Moderate complexity; defer unless issues arise.

## Validation Not Required

- **Database integration tests** for `AuthJsRequestIdentitySource` — the identity source only reads from the session; it doesn't touch the DB. The DB integration is covered by existing `DrizzleInternalIdentityLookup` tests.
- **Testing TENANCY_MODE=org+provider** — explicitly out of scope; documented as unsupported.
- **Testing Auth.js session database adapter** — JWT strategy is used; no Drizzle session tables.
- **Testing all OAuth providers** — GitHub is the only provider in scope. Credentials is for dev testing.
- **Storybook tests for `AuthJsSessionProvider`** — it's a thin wrapper; smoke test is sufficient.
- **E2E for Phase 1-3** — unit tests are sufficient signal for the identity mapping and UI components.

## Commands / Checks

Run in this order after each phase:

```shell
# After every phase:
pnpm typecheck              # Zero errors required
pnpm lint --fix             # Zero errors required (use --fix, not plain lint)
pnpm test                   # All unit tests green including new AuthJS tests

# After Phase 4 (UI complete):
pnpm e2e                    # AuthJS auth flow E2E spec

# After Phase 6 (full completion):
pnpm test:integration       # Integration tests
pnpm test:all               # Combined Vitest suite
```

## Validation Gaps

1. **No E2E coverage for AuthJS currently** — this is expected (provider is a stub). Phase 4 closes this.
2. **`AuthJsEdgeIdentitySource` test is missing** — must be created in Phase 1 alongside the implementation.
3. **Edge module wiring test** (`edge.test.ts`) may not verify the specific class used for `authjs` case — check and strengthen if needed.
4. **No integration test for the full `auth.ts` config** with real Auth.js session lifecycle — acceptable for boilerplate; manual verification is the expectation.

## Recommendation

**Validation plan is minimal but acceptable** given the phased approach.

The critical validation signal is:

1. Unit tests for `AuthJsRequestIdentitySource` and `AuthJsEdgeIdentitySource` (Phases 1)
2. Typecheck and lint passing (every phase)
3. E2E for the sign-in flow (Phase 4)
4. Regression green for existing Clerk tests (every phase)

The phased delivery approach means each phase is independently testable. This is a strong validation strategy for a non-trivial adapter implementation.

## Recommended Next Action

Proceed to Implementation (Phase 1) with the constraint document in hand. Create unit tests alongside each implementation file.
