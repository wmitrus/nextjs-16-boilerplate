# LOCKED Roadmap — Production Provisioning Refactor

Status: `READY_FOR_APPROVAL`
Scope source: `PLAN.md` + `RESOURCES_ACTIONS_DRAFT.md`

## Configuration Model (binding across PR-0..PR-3)

### Axis 1 — AUTH_PROVIDER

- `AUTH_PROVIDER=clerk|authjs|supabase`
- Odpowiada wyłącznie za pozyskanie external identity claims (`userId`, `email`, opcjonalnie claims tenantowe).
- Nie determinuje modelu tenancy.

### Axis 2 — TENANCY_MODE

- `TENANCY_MODE=single|personal|org`
- Odpowiada za to, jak wyznaczamy tenant context i jak przebiega provisioning.

### Axis 3 — TENANT_CONTEXT_SOURCE (dla `TENANCY_MODE=org`)

- `TENANT_CONTEXT_SOURCE=provider|db`
- `provider`: tenant context pochodzi z claima providera (`tenantExternalId`).
- `db`: tenant context pochodzi z aplikacji (header/cookie/subdomain -> internal tenant id).
- Dla `single/personal` parametr jest ignorowany.

### Validity Rules

- `TENANCY_MODE=org` wymaga jawnego `TENANT_CONTEXT_SOURCE`.
- `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=provider` wymaga dostępnego `tenantExternalId` w request identity.
- `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=db` nie wymaga claimów tenantowych od providera.
- `TENANCY_MODE` jest niezależne od `AUTH_PROVIDER` (brak niejawnego mapowania provider -> tenancy).

### Boilerplate Defaults

- Start default: `TENANCY_MODE=single`.
- SaaS na Clerk Organizations: `TENANCY_MODE=org`, `TENANT_CONTEXT_SOURCE=provider`.
- Uniwersalne org-mode (clerk/authjs/supabase): `TENANCY_MODE=org`, `TENANT_CONTEXT_SOURCE=db`.

## PR-0 — Identity Boundary Fix + Resolver Purity (Blocker)

### Goal

Naprawić konflikt semantyki ID (`internal` vs `external`) i usunąć side-effecty provisioningu z `TenantResolver`, aby PR-1/PR-2/PR-3 były wdrażane na stabilnym fundamencie architektonicznym.

### Architecture Decisions (binding)

- [ ] Canonical ID rule:
  - [ ] `Identity.id` i `TenantContext.*` zawsze oznaczają internal UUID z naszej bazy.
  - [ ] `RequestIdentitySourceData.userId/email/tenantExternalId/tenantRole` zawsze oznaczają external claims providera.
- [ ] Purity rule:
  - [ ] `RequestScopedIdentityProvider` i `TenantResolver` są read-only (zero write-side effects).
- [ ] Provisioning rule:
  - [ ] Jedyna ścieżka write dla user/tenant/membership/role bootstrap to Node `ProvisioningService.ensureProvisioned(...)`.
- [ ] Failure rule:
  - [ ] Brak mapowania internal IDs w read-path zwraca kontrolowany błąd domenowy (`USER_NOT_PROVISIONED` / `TENANT_NOT_PROVISIONED`), bez cichego auto-provision.
- [ ] Orthogonality rule:
  - [ ] `AUTH_PROVIDER` i `TENANCY_MODE` są niezależnymi osiami konfiguracji.
  - [ ] `TENANT_CONTEXT_SOURCE` aktywuje się tylko dla `TENANCY_MODE=org`.

### Deliverables

- [ ] Semantyka ID (kontrakt i egzekucja)
  - [ ] `Identity.id` = **internal** `users.id` (UUID) w całym core/security/authorization.
  - [ ] `RequestIdentitySourceData` znormalizowane do:
    - [ ] `userId?: string`
    - [ ] `email?: string`
    - [ ] `tenantExternalId?: string`
    - [ ] `tenantRole?: string`
  - [ ] Wycofać provider-specific nazwy pól (`orgId`, `orgRole`) z warstw core.
  - [ ] Dodać jawne komentarze/invariants w kontraktach i adapterach (bez domysłów semantycznych).
- [ ] Rozdzielenie read-path i write-path w auth infra
  - [ ] Wydzielić read-only lookup (np. `resolveInternalUserId`, `resolveInternalTenantId`) bez tworzenia rekordów.
  - [ ] Write-path create/link (user/tenant/membership/role) przenieść do `ProvisioningService.ensureProvisioned(...)` (Node-only).
  - [ ] `RequestScopedTenantResolver` ma wykonywać wyłącznie resolve kontekstu tenantu (zero insert/upsert, zero bootstrapu ról/membership).
  - [ ] Usunąć `ensureTenantAccess()` z flow resolvera.
- [ ] Org DB context source (dla `TENANCY_MODE=org`, `TENANT_CONTEXT_SOURCE=db`)
  - [ ] Dodać port `ActiveTenantContextSource` (odczyt internal tenant id z request context).
  - [ ] Dodać adaptery runtime (header/cookie) oraz deterministyczny priorytet źródeł.
  - [ ] Resolver weryfikuje membership read-only (brak auto-attach membership).
- [ ] Onboarding i provider-specific API
  - [ ] `completeOnboarding()` najpierw wywołuje `ensureProvisioned(...)`, a dopiero potem wykonuje dalszy flow onboardingu.
  - [ ] `completeOnboarding()` pobiera external `userId/email/tenantExternalId/tenantRole` wyłącznie z `AUTH.IDENTITY_SOURCE` jako input do provisioningu.
  - [ ] Internal `identity.id` pozostaje wyłącznie do domain/security/authorization.
  - [ ] Brak mapowania tenantu zwraca `TENANT_NOT_PROVISIONED` (bez write-side effects w resolverze).
- [ ] Runtime wiring
  - [ ] `createAuthModule` nie przekazuje write-capabilities do `IdentityProvider` ani `TenantResolver`.
  - [ ] Edge path pozostaje context-only i bez DB write.
- [ ] Cleanup techniczny
  - [ ] Usunąć bootstrap membership/role z `DrizzleExternalIdentityMapper`; mapper zostaje strict mapping-only.
  - [ ] Wprowadzić nazewnictwo/typy/helpery utrudniające podanie internal ID do provider SDK.

### Tests

- [ ] Unit: `RequestScopedIdentityProvider` zwraca internal ID i nie zwraca external ID jako `Identity.id`.
- [ ] Unit: `RequestScopedTenantResolver` nie wywołuje metod write-path.
- [ ] Unit: onboarding przekazuje external `userId/email/tenantExternalId/tenantRole` do `ensureProvisioned(...)`.
- [ ] Unit: `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=provider` wymaga `tenantExternalId`.
- [ ] Unit: `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=db` czyta active tenant id z `ActiveTenantContextSource`.
- [ ] Integration: brak mapowania tenantu => kontrolowany błąd/redirect (bez auto-provision w resolverze).
- [ ] Regression: `tenantResolver.resolve()` nie wykonuje insertów do `memberships`/`roles`.
- [ ] Regression: matrix `AUTH_PROVIDER x TENANCY_MODE x TENANT_CONTEXT_SOURCE` nie wprowadza couplingu provider->tenancy.

### Exit Criteria

- [ ] Brak miejsc, gdzie `Identity.id` jest przekazywane bezpośrednio do Clerk SDK.
- [ ] `TenantResolver` jest czystym read-path (no side effects).
- [ ] Build/typecheck/testy auth+tenancy przechodzą bez regresji.
- [ ] PR-1 startuje z jednoznaczną semantyką ID i czystą granicą modułów.

---

## PR-1 — Foundations (Config + Contracts + Tenancy Strategy)

### Goal

Wprowadzić konfigurację tenancy niezależną od providera auth oraz jawne strategie resolvera dla `single|personal|org`.

### Deliverables

- [ ] `src/core/env.ts`
  - [ ] dodać `TENANCY_MODE` (`single|personal|org`)
  - [ ] dodać `DEFAULT_TENANT_ID` (wymagane dla `single`)
  - [ ] dodać `TENANT_CONTEXT_SOURCE` (`provider|db`) jako required gdy `TENANCY_MODE=org`
  - [ ] dodać `TENANT_CONTEXT_HEADER` (default: `x-tenant-id`) i `TENANT_CONTEXT_COOKIE` (default: `active_tenant_id`) dla `org/db`
  - [ ] opcjonalnie `FREE_TIER_MAX_USERS`
- [ ] `src/core/contracts/identity.ts`
  - [ ] zastąpić provider-specific pola:
    - [ ] `tenantExternalId?: string`
    - [ ] `tenantRole?: string`
- [ ] `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`
  - [ ] mapowanie `tenantExternalId` i `tenantRole` z Clerk claims (best-effort + fallback)
- [ ] `src/modules/auth/infrastructure/authjs/*` + `supabase/*`
  - [ ] jawnie zwracać `tenantExternalId/tenantRole` jako `undefined` (jeśli brak custom claims)
- [ ] `src/core/runtime/bootstrap.ts`
  - [ ] resolver strategy wiring wg `TENANCY_MODE` i `TENANT_CONTEXT_SOURCE`
  - [ ] rejestracja:
    - [ ] `SingleTenantResolver`
    - [ ] `PersonalTenantResolver`
    - [ ] `OrgProviderTenantResolver` (`org/provider`)
    - [ ] `OrgDbTenantResolver` (`org/db`)
- [ ] Nowe pliki strategii resolvera (required)
  - [ ] `src/modules/provisioning/domain/tenancy-mode.ts`
  - [ ] `src/modules/provisioning/domain/tenant-context-source.ts`
  - [ ] `src/modules/provisioning/infrastructure/*TenantResolver.ts`
  - [ ] `src/modules/provisioning/infrastructure/request-context/*` (active tenant source)

### Tests

- [ ] Unit: env parsing i walidacja mode/default tenant.
- [ ] Unit: walidacja kombinacji `TENANCY_MODE` x `TENANT_CONTEXT_SOURCE`.
- [ ] Unit: Clerk identity source zwraca `tenantExternalId` i `tenantRole` (gdy claim dostępny).
- [ ] Unit: resolver selection dla `single/personal/org(provider|db)`.
- [ ] Unit: `org/provider` bez `tenantExternalId` => `MissingTenantContextError`.
- [ ] Unit: `org/db` bez active tenant w request context => `MissingTenantContextError`.
- [ ] Unit: `org/db` z tenantem bez membership => `TENANT_MEMBERSHIP_REQUIRED`.

### Exit Criteria

- [ ] Build/typecheck bez regresji.
- [ ] Brak niejawnego couplingu `AUTH_PROVIDER -> TENANCY_MODE`.
- [ ] Brak zmian behavioru autoryzacji poza routingiem resolvera i walidacją context-source.
- [ ] Edge path bez DB access.

---

## PR-2 — Provisioning Engine (Transactional + Least Privilege)

### Goal

Dostarczyć produkcyjny `ensureProvisioned()` z idempotencją, limitami i logiką tenantową zgodną z `TENANCY_MODE` + `TENANT_CONTEXT_SOURCE`.

### Deliverables

- [ ] Nowy moduł `src/modules/provisioning/**`
  - [ ] `domain/ProvisioningService.ts`
  - [ ] `domain/errors.ts`
  - [ ] `infrastructure/drizzle/DrizzleProvisioningService.ts`
  - [ ] `index.ts` (wiring)
- [ ] `ProvisioningInput` zawiera:
  - [ ] external identity: `provider`, `externalUserId`, `email?`
  - [ ] tenant claim fields: `tenantExternalId?`, `tenantRole?`
  - [ ] org/db context: `activeTenantId?`
  - [ ] runtime config: `tenancyMode`, `tenantContextSource?`
- [ ] Write-path repositories/commands (w module provisioning)
  - [ ] ensure role (`owner/member`)
  - [ ] upsert `tenant_attributes` defaults
  - [ ] upsert policy defaults (bez wildcard)
  - [ ] insert membership (idempotent, no escalation)
- [ ] `src/modules/auth/infrastructure/drizzle/DrizzleExternalIdentityMapper.ts`
  - [ ] uprościć do mapping-only (bez decyzji roli/policies)
- [ ] Tenant resolution rules (inside provisioning service)
  - [ ] `single`: tenant = `DEFAULT_TENANT_ID` (ensure exists)
  - [ ] `personal`: ensure tenant per user (idempotent 1:1 mapping user->tenant)
  - [ ] `org/provider`: require `tenantExternalId`, map `(provider, tenantExternalId) -> tenant`
  - [ ] `org/db`: require `activeTenantId`, tenant istnieje i jest zarządzany w DB
- [ ] Membership rules
  - [ ] brak automatycznej eskalacji istniejącego membership
  - [ ] `org/db`: brak auto-attach do obcego tenantu; jeśli brak membership i brak jawnego flow create/invite => `TENANT_MEMBERSHIP_REQUIRED`
- [ ] Role decision rules
  - [ ] `org/provider`: rola z `tenantRole`, fallback `member`
  - [ ] `tenantCreatedNow && tenantRole indicates owner/admin` => `owner`
  - [ ] `org/db`: rola z istniejącego membership DB (claimy providera ignorowane)
- [ ] Free-tier guard
  - [ ] limit przed insertem nowego membership
  - [ ] błąd `TENANT_USER_LIMIT_REACHED`
- [ ] `provisioning:ensure` enforcement jako **internal Node guard** (nie przez tenant-scoped policies)
- [ ] Dodać audit event dla `provisioning:ensure` (success/failure)

### Tests

- [ ] Unit: role mapping provider claim -> internal (`owner/member`) dla `org/provider`.
- [ ] Unit: free-tier guard semantics.
- [ ] Unit: tenant branching (`single`, `personal`, `org/provider`, `org/db`).
- [ ] Unit: `org/db` bez membership zwraca `TENANT_MEMBERSHIP_REQUIRED`.
- [ ] DB integration: idempotencja transakcyjna i race-safe insert.
- [ ] DB integration: brak wildcard policy bootstrap.
- [ ] DB integration: brak role escalation.
- [ ] DB integration: `personal` mode tworzy dokładnie jeden tenant na usera.
- [ ] DB integration: `org/provider` mapuje external tenant identity bez create side effects poza provisioningiem.

### Exit Criteria

- [ ] `ensureProvisioned()` działa dla `single/personal/org(provider|db)`.
- [ ] Mapper nie zawiera logiki policy/role bootstrap.
- [ ] Wszystkie guardrails (`no *`, `no escalation`) przechodzą.

---

## PR-3 — Onboarding Integration + Policy Templates Versioning

### Goal

Spiąć provisioning z onboardingiem Node dla wszystkich trybów tenancy i domknąć lifecycle templates (versioning + migration).

### Deliverables

- [ ] `src/modules/auth/ui/onboarding-actions.ts`
  - [ ] wywołać `ensureProvisioned(...)` na początku `completeOnboarding()`
  - [ ] przekazać external identity claims z `AUTH.IDENTITY_SOURCE` (`userId`, `email`, `tenantExternalId`, `tenantRole`)
  - [ ] dla `org/db` przekazać `activeTenantId` z request context source
  - [ ] dopiero potem profile update + onboardingComplete
- [ ] `src/modules/provisioning/policy/templates.ts`
  - [ ] owner/member templates oparte o `RESOURCES_ACTIONS_DRAFT`
  - [ ] jeden współdzielony condition template dla member self-access:
    - [ ] `subject.userId == resource.userId` (self read/update)
- [ ] Policy template versioning
  - [ ] `POLICY_TEMPLATE_VERSION`
  - [ ] persist tenant version w `tenant_attributes.policy_template_version` (INT, default `0`)
  - [ ] idempotent apply missing templates
- [ ] Runbook/docs update
  - [ ] kiedy onboarding provisioning wystarcza
  - [ ] kiedy opcjonalny `db:seed:prod:templates`
  - [ ] matrix konfiguracji:
    - [ ] `AUTH_PROVIDER=clerk` + `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=provider`
    - [ ] `AUTH_PROVIDER=clerk|authjs|supabase` + `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=db`
    - [ ] `TENANCY_MODE=single` (start default)
    - [ ] `TENANCY_MODE=personal` (tenant per user)
  - [ ] flow UX dla `org/db`: create/select tenant before onboarding completion

### Tests

- [ ] Integration: `completeOnboarding()` provisioning-first order.
- [ ] Integration: `org/provider` without `tenantExternalId` => controlled failure.
- [ ] Integration: `org/db` without `activeTenantId` => controlled failure.
- [ ] Integration: `org/db` with active tenant but missing membership => controlled failure (`TENANT_MEMBERSHIP_REQUIRED`).
- [ ] E2E smoke: first-login flow kończy się autoryzowalnym stanem.
- [ ] E2E matrix:
  - [ ] `single` mode (Clerk bez orgów)
  - [ ] `personal` mode (Auth.js)
  - [ ] `org/provider` (Clerk Organizations)
  - [ ] `org/db` (Supabase/Auth.js + db tenant selector)
- [ ] Regression: template version bump nie daje privilege creep.

### Exit Criteria

- [ ] Onboarding domyka user/tenant/membership/policies deterministycznie.
- [ ] Versioning działa i jest auditowalny.
- [ ] Dokumentacja operacyjna jest aktualna.

---

## Global Guardrails (applies to all PRs)

- [ ] `AUTH_PROVIDER` i `TENANCY_MODE` są orthogonal (brak hard-coded coupling).
- [ ] `TENANCY_MODE=org` działa zarówno dla `TENANT_CONTEXT_SOURCE=provider`, jak i `TENANT_CONTEXT_SOURCE=db`.
- [ ] No wildcard default policies (`*`) anywhere in bootstrap defaults.
- [ ] No silent membership role escalation.
- [ ] Provider role claims są source-of-truth tylko dla `org/provider` (z kontrolowanym fallback).
- [ ] Provider claims tenantowe są wymagane tylko w `org/provider` (nie globalnie).
- [ ] `provisioning:ensure` nie zależy od tenant policy bootstrap (działa przed istnieniem policy defaults).
- [ ] Edge middleware remains context-only.
- [ ] All new code covered by focused tests.

## Approval

- [ ] APPROVE PR-0 scope
- [ ] APPROVE PR-1 scope
- [ ] APPROVE PR-2 scope
- [ ] APPROVE PR-3 scope
- [ ] APPROVE full LOCKED roadmap
