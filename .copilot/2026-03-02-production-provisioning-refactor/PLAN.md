# Production Provisioning Refactor Plan (Identity Mapping + Tenant RBAC)

Status: `DRAFT` (czeka na Twoje potwierdzenie)
Owner: `feat/drizzle`
Date: `2026-03-02`

Locked breakdown: `IMPLEMENTATION_LOCKED.md` (PR-0 / PR-1 / PR-2 / PR-3)

## 1) Cel refaktoru

Domknąć **produkcyjny flow provisioningu** bez skrótów:

- idempotentny provisioning user + tenant + membership,
- **least-privilege** (brak auto-admin, brak wildcard policy),
- jawne `resources/actions` jako kontrakt polityk,
- wyraźny podział: Edge = context only, Node = DB/provisioning.

## 2) Zakres (in-scope)

- Provisioning uruchamiany w Node (Server Action / onboarding path).
- Transakcyjna, idempotentna logika `ensureProvisioned`.
- Tenant defaults (`tenant_attributes`) + free-tier user limit.
- Przełączalny model tenantów przez konfigurację (`TENANCY_MODE`) oraz źródło kontekstu tenantu (`TENANT_CONTEXT_SOURCE` dla `org`), bez per-app refaktoru kodu.
- Jawny katalog `resources/actions` w kodzie.
- Tenant-scoped role/policy defaults dla `owner` i `member`.
- Policy templates versioning i bezpieczne dopinanie zmian per-tenant.

## 3) Poza zakresem (out-of-scope)

- Webhook sync jako wymagany mechanizm startowy.
- Globalne wildcard policies (`*`) i automatyczny super-admin.
- Rozbudowane billing flows beyond free-tier guardrails.

## 4) Docelowe zasady bezpieczeństwa

- **No wildcard escalation**: brak `actions=['*']` i `resource='*'` jako domyślny bootstrap.
- **No silent privilege upgrade**: istniejące `membership.role_id` nie jest nadpisywane bez jawnej reguły.
- **Tenant isolation**: wszystkie policies tenant-scoped.
- **Idempotency first**: każde wywołanie może się powtórzyć bez skutków ubocznych.
- **Separation of concerns**: mapper robi tylko mechaniczne mapowanie external ↔ internal; decyzje roli/defaults/limits należą do `ProvisioningService`.
- **Role source-of-truth**:
  - `org/provider`: role claims providera (`tenantRole`) są źródłem prawdy, z kontrolowanym fallback.
  - `org/db`: źródłem prawdy jest membership w DB (claims providera tenantowych nie wymagamy).
- **Provisioning internal guard**: `provisioning:ensure` jest egzekwowane jako Node internal guard (nie przez tenant-scoped policies).

## 4.1) Decyzje architektoniczne PR-0 (wiążące)

- `Identity.id` i `TenantContext` używają wyłącznie internal UUID.
- `RequestIdentitySourceData.userId/email/tenantExternalId/tenantRole` zawiera wyłącznie external claims providera.
- `IdentityProvider` i `TenantResolver` są read-only (zero write-side effects).
- Jedyna ścieżka write dla create/link user+tenant+membership+role to `ProvisioningService.ensureProvisioned(...)` w Node.
- Brak mapowania internal IDs zwraca kontrolowany błąd domenowy (`USER_NOT_PROVISIONED` / `TENANT_NOT_PROVISIONED`), bez auto-provision w resolverze.
- Onboarding provisioning trigger jest pojedynczy i jawny: `completeOnboarding()`; nie dodajemy ukrytego fallbacku „first Node page”.
- `AUTH_PROVIDER` i `TENANCY_MODE` są orthogonalne; `TENANT_CONTEXT_SOURCE` jest aktywny tylko dla `TENANCY_MODE=org`.

## 5) Plan implementacji (checklista)

### Phase 0 — Identity Boundary & Resolver Purity (Blocker)

- [ ] Ujednolicić semantykę ID w kontraktach (`internal` vs `external`) i dopisać invariants w komentarzach.
- [ ] Rozdzielić mapper na read-path lookup oraz write-path provisioning API.
- [ ] Usunąć wszystkie write-side effects z `RequestScopedIdentityProvider` i `TenantResolver`.
- [ ] Dodać błędy domenowe `USER_NOT_PROVISIONED` i `TENANT_NOT_PROVISIONED` w read-path.
- [ ] Znormalizować raw identity fields:
  - [ ] `tenantExternalId?` zamiast provider-specific `orgId?`
  - [ ] `tenantRole?` zamiast provider-specific `orgRole?`
- [ ] Dodać `ActiveTenantContextSource` dla `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=db`.
- [ ] Ustawić onboarding jako jedyny trigger provisioningu: `completeOnboarding()` -> `ensureProvisioned(...)` -> dalszy flow.
- [ ] Usunąć bootstrap membership/role z mappera auth; mapper zostaje mapping-only.
- [ ] Dodać testy regresji potwierdzające brak insertów w resolverze/providerze.

### Phase A — Contracts & Domain Constants

- [ ] Dodać moduł stałych `resources/actions` (single source of truth).
- [ ] Ustalić naming konwencji akcji (`resource:verb`) zgodny z `createAction`.
- [ ] Spiąć `secure-action`/feature actions z nowymi stałymi (usunąć anonimowe `system:handler`).
- [ ] Dodać testy jednostkowe spójności (`Actions` valid, brak duplikatów).
- [ ] Dodać do env schema + runbook:
  - [ ] `TENANCY_MODE` + `DEFAULT_TENANT_ID`
  - [ ] `TENANT_CONTEXT_SOURCE` (required only for `TENANCY_MODE=org`)
  - [ ] `TENANT_CONTEXT_HEADER` / `TENANT_CONTEXT_COOKIE` (dla `org/db`)

### Phase A1 — Tenancy Strategy (config-driven)

- [ ] Zdefiniować `TENANCY_MODE`:
  - [ ] `single` — default tenant (`DEFAULT_TENANT_ID`)
  - [ ] `personal` — tenant per user
  - [ ] `org` — tenant per organizational context (provider lub db)
- [ ] Dodać `TENANT_CONTEXT_SOURCE` dla `org`:
  - [ ] `provider` — tenant context z `tenantExternalId` claima providera
  - [ ] `db` — tenant context z app-level selectora (cookie/header/subdomain -> internal tenant id)
- [ ] Dodać strategie resolvera tenantu:
  - [ ] `SingleTenantResolver`
  - [ ] `PersonalTenantResolver`
  - [ ] `OrgProviderTenantResolver`
  - [ ] `OrgDbTenantResolver`
- [ ] W runtime bootstrap rejestrować resolver wg `TENANCY_MODE` + `TENANT_CONTEXT_SOURCE`.

### Phase B — Provisioning Service API

- [ ] Dodać `ProvisioningService` + `ProvisioningInput/Result` kontrakty.
- [ ] Ustalić lokalizację modułu: `src/modules/provisioning`.
- [ ] Zdefiniować porty/repositories do operacji write/upsert (identity, tenant, role, membership, tenantAttributes).
- [ ] Dodać write-path (`*CommandRepository`) dla: ensure role, upsert tenant_attributes, upsert policy defaults, insert membership.
- [ ] Dodać kody błędów domenowych (`TENANT_USER_LIMIT_REACHED`, `TENANT_CONTEXT_REQUIRED`, itp.).
- [ ] Rozszerzyć `ProvisioningInput` o:
  - [ ] external identity: `provider`, `externalUserId`, `email?`
  - [ ] tenant claims: `tenantExternalId?`, `tenantRole?`
  - [ ] app context for `org/db`: `activeTenantId?`
  - [ ] runtime axes: `tenancyMode`, `tenantContextSource?`

### Phase C — Transactional Idempotent Flow

- [ ] Implementacja `ensureProvisioned(input)` w jednej transakcji.
- [ ] Krok User: resolve/link by `(provider, external_user_id)` + fallback by email.
- [ ] Krok Tenant (mode-aware):
  - [ ] `single`: użyj `DEFAULT_TENANT_ID`
  - [ ] `personal`: resolve/create tenant per user
  - [ ] `org/provider`: resolve/link by `(provider, tenantExternalId)` + flaga `tenantCreatedNow`
  - [ ] `org/db`: użyj `activeTenantId` z selector source (tenant istnieje w DB)
- [ ] Krok Defaults: upsert `tenant_attributes` (`plan=free`, `contract_type=standard`, `max_users=5`, `features=[]`).
- [ ] Krok Roles: ensure tenant roles `owner`, `member` (unikalne per `(tenant_id, name)`).
- [ ] Krok Role Decision (w serwisie, nie w mapperze):
  - [ ] `org/provider`: odczytaj `tenantRole` i zmapuj na internal role (`owner`/`member`).
  - [ ] jeśli `tenantCreatedNow === true`, przypisz `owner` tylko gdy claim wskazuje owner/admin; inaczej `member`.
  - [ ] `org/db`: rola wynika z membership DB (bez interpretacji tenant claimów providera).
- [ ] Krok Limits: enforce free-tier limit **przed insertem nowego membership** (tylko gdy membership jeszcze nie istnieje).
- [ ] Krok Membership: insert-only idempotent attach z wyliczoną rolą (bez auto-upgrade roli, bez auto-attach w `org/db` bez jawnego flow).
- [ ] Mapper pozostaje warstwą mapowania ID (bez decyzji o roli/default policies).

### Phase D — Policy Templates (Tenant-Scoped)

- [ ] Dodać kodowe templates polityk dla `owner` i `member` oparte o `resources/actions`.
- [ ] Usunąć zależność od wildcard policy bootstrap.
- [ ] Zasilić tenantowe policy defaults podczas provisioningu (idempotentnie).
- [ ] Dodać jeden współdzielony condition template dla member self-access: `subject.userId == resource.userId`.
- [ ] Dodać `POLICY_TEMPLATE_VERSION` i persist stanu per tenant w `tenant_attributes.policy_template_version`.
- [ ] Dodać migrator templates: jeśli wersja tenantu < current, provisioning dopina brakujące policy defaults bez eskalacji uprawnień.

### Phase E — Integration Points (Node-only)

- [ ] Dodać `ensureProvisionedAction` (Server Action, Node runtime).
- [ ] Udokumentować onboarding trigger path: `src/app/onboarding/page.tsx` -> `completeOnboarding()`.
- [ ] Wpiąć `ensureProvisioned(...)` bezpośrednio w `completeOnboarding()` przed zapisem profilu/metadanych onboarding.
- [ ] Nie dodawać fallbacku provisioningu poza onboarding action (brak ukrytych side effects).
- [ ] Zostawić Edge middleware bez DB access (context-only).
- [ ] Dodać telemetry/audit event dla outcome provisioningu.
- [ ] Dla `org/db`: dodać spójny tenant selector contract (header/cookie) i walidację membership przed akcjami biznesowymi.

### Phase F — Seed Strategy (Production-realistic)

- [ ] Rozdzielić semantycznie:
  - [ ] **Templates w kodzie** (resources/actions + policy templates) — utrzymywane w Phase A + D.
  - [ ] **Apply templates do DB per-tenant** — wykonywane przez provisioning (Phase C + D).
- [ ] Traktować `db:seed:prod:templates` jako opcjonalny (potrzebny głównie dla danych globalnych/systemowych lub testów migracji deserializera).
- [ ] Oddzielić `dev/test seed` od runtime provisioningu produkcyjnego.
- [ ] Uzupełnić runbook: kiedy seed jest potrzebny, a kiedy wystarcza onboarding provisioning.

### Phase G — Testing Matrix

- [ ] Unit: provisioning algorithm (idempotencja, conflict email, brak org).
- [ ] DB integration: transactionality i race-safe behavior.
- [ ] Policy engine/repository integration: owner/member policy resolution.
- [ ] E2E smoke: first login + org => provisioning => authorized feature path.
- [ ] Regression: brak auto-admin i brak wildcard grantów.
- [ ] Konfiguracyjny test matrix:
  - [ ] `AUTH_PROVIDER=clerk` + `TENANCY_MODE=single`
  - [ ] `AUTH_PROVIDER=clerk` + `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=provider`
  - [ ] `AUTH_PROVIDER=authjs` + `TENANCY_MODE=personal`
  - [ ] `AUTH_PROVIDER=supabase` + `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=db`
- [ ] Negative matrix:
  - [ ] `TENANCY_MODE=org` bez `TENANT_CONTEXT_SOURCE` => config error
  - [ ] `org/provider` bez `tenantExternalId` => controlled error
  - [ ] `org/db` bez `activeTenantId` => controlled error
  - [ ] `org/db` tenant bez membership => controlled error (`TENANT_MEMBERSHIP_REQUIRED`)

### Phase H — Hardening & Review Gates

- [ ] Dodać checklistę bezpieczeństwa do PR template dla RBAC/provisioning.
- [ ] Dodać guard test: żadna default policy nie zawiera `*`.
- [ ] Dodać guard test: provisioning nie eskaluje istniejącej roli.
- [ ] Potwierdzić brak nowych cykli zależności (`skott`, `madge`).

## 6) Definicja "Done"

- Flow first-login działa idempotentnie dla wszystkich wspieranych kombinacji provider/tenancy.
- User otrzymuje tylko minimalne uprawnienia zgodne z rolą (`owner/member`) i templates.
- Brak wildcard bootstrap i brak auto-escalation.
- Free-tier limit egzekwowany poprawnym kodem błędu.
- Policy templates versioning działa i aktualizuje tenanty bez privilege creep.
- `AUTH_PROVIDER` i `TENANCY_MODE` są niezależne w praktyce (potwierdzone matrix testami).
- `org` mode działa w obu wariantach: `provider` i `db`.
- Testy: unit + integration + smoke przechodzą.
- Dokumentacja runbook + scripts zaktualizowane.

## 7) Ryzyka i mitigacje

- Ryzyko race condition przy równoległych logowaniach.
  - Mitigacja: unikalne constraints + transakcja + retry policy na conflict.
- Ryzyko dryfu polityk między kodem i DB.
  - Mitigacja: `POLICY_TEMPLATE_VERSION` + per-tenant apply w provisioningu + idempotent upsert.
- Ryzyko niejawnego privilege creep.
  - Mitigacja: testy guardrail (`no *`, `no role escalation`).
- Ryzyko ukrytego couplingu provider -> tenancy.
  - Mitigacja: config validation + matrix tests + contract tests na raw identity.

## 8) Proponowana kolejność wykonania

1. Phase 0 (identity boundary + resolver purity)
2. Phase A (resources/actions)
3. Phase B+C (service + transakcja)
4. Phase D (policy templates)
5. Phase E (wpięcie Node onboarding)
6. Phase F (prod seed templates)
7. Phase G+H (testy + hardening)

## 9) Brakujące artefakty do startu implementacji

- [ ] Uzupełnić kontrakty błędów domenowych (`USER_NOT_PROVISIONED`, `TENANT_NOT_PROVISIONED`, `TENANT_MEMBERSHIP_REQUIRED`, `TENANT_USER_LIMIT_REACHED`).
- [ ] Zdefiniować write-repo/commands w `src/modules/provisioning` (bez mieszania z read-model authorization).
- [ ] Ustalić finalne mapowanie claims provider -> role internal dla `org/provider` (`owner/admin -> owner`, fallback `member`).
- [ ] Ustalić kontrakt active tenant selectora dla `org/db` (`TENANT_CONTEXT_HEADER` / `TENANT_CONTEXT_COOKIE`).

## 10) Konkretny zakres zmian plikowych (v1)

- [ ] `src/core/env.ts` — dodać `TENANCY_MODE`, `DEFAULT_TENANT_ID`, `TENANT_CONTEXT_SOURCE`, `TENANT_CONTEXT_HEADER`, `TENANT_CONTEXT_COOKIE`, opcjonalnie `FREE_TIER_MAX_USERS`.
- [ ] `src/core/runtime/bootstrap.ts` — resolver/provisioning wiring wg `TENANCY_MODE` + `TENANT_CONTEXT_SOURCE`.
- [ ] `src/core/contracts/identity.ts` — pola raw identity: `tenantExternalId?: string`, `tenantRole?: string`.
- [ ] `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts` — mapowanie `tenantExternalId` + `tenantRole` z claimów.
- [ ] `src/modules/auth/infrastructure/authjs/*` + `supabase/*` — jawne `tenantExternalId/tenantRole` jako undefined (bez custom claims).
- [ ] `src/modules/auth/ui/onboarding-actions.ts` — wywołanie `ensureProvisioned()` przed profile update/onboardingComplete.
- [ ] `src/modules/auth/infrastructure/drizzle/DrizzleExternalIdentityMapper.ts` — usunąć logikę bootstrap roli/policies z mappera (mapping-only).
- [ ] `src/modules/provisioning/infrastructure/request-context/*` — source adaptery dla active tenant (`org/db`).
- [ ] Nowy moduł: `src/modules/provisioning/**` (`ProvisioningService`, `DrizzleProvisioningService`, `tenancy-mode`, `errors`, `policy/templates`, `index`).

## 11) Tenancy Operating Modes (konfiguracyjnie)

- [ ] Boilerplate defaults:
  - [ ] start: `TENANCY_MODE=single`
  - [ ] Clerk SaaS: `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=provider`
  - [ ] provider-agnostic org SaaS: `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=db`
- [ ] Tryb `single-tenant` (np. blog/prosta app):
  - [ ] TenantResolver zwraca stały/default tenant.
  - [ ] Claims tenantowe providera nie są wymagane.
- [ ] Tryb `personal-tenant` (B2C subskrypcje):
  - [ ] tenant = konto użytkownika.
  - [ ] subscription i limity przypięte do personal tenant.
  - [ ] Claims tenantowe providera nie są wymagane.
- [ ] Tryb `org-tenant`:
  - [ ] `TENANT_CONTEXT_SOURCE=provider`: org context z providera (np. Clerk Organizations).
  - [ ] `TENANT_CONTEXT_SOURCE=db`: org context z DB selectora (działa dla `clerk|authjs|supabase`).
  - [ ] Membership/roles/policies zawsze tenant-scoped.

---

## Do zatwierdzenia

- [ ] Akceptuję plan 1:1 i można implementować w tej kolejności.
- [ ] Chcę najpierw tylko Phase A + B (minimalny PR), reszta później.
- [ ] Chcę dodatkowo webhook strategy jako osobny Phase I.
