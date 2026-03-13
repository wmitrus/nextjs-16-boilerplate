# Zestaw agentow dla Twojego projektu

| Agent                     | Command              | Cel                                                 | Kiedy uzywac                                     | Input                          | Output                                                      | Priority   |
| ------------------------- | -------------------- | --------------------------------------------------- | ------------------------------------------------ | ------------------------------ | ----------------------------------------------------------- | ---------- |
| SDD Architect             | `/architect-sdd`     | Projektowanie feature przez spec-driven development | Zanim napiszesz kod dla nowej funkcji lub modulu | idea feature / problem         | spec, architektura, phased plan, risks, acceptance criteria | ⭐⭐⭐⭐⭐ |
| Modular Monolith Reviewer | `/review-boundaries` | Kontrola boundary i architektury modular monolith   | Po refactorze lub przed merge                    | zmienione pliki / repo         | boundary leaks, forbidden dependencies, remediation plan    | ⭐⭐⭐⭐⭐ |
| Next.js Runtime Architect | `/next-runtime`      | Decyzje runtime Next.js                             | Projektowanie flow w App Router                  | feature spec lub fragment kodu | server/client split, runtime placement, caching strategy    | ⭐⭐⭐⭐   |
| Auth & Tenancy Architect  | `/auth-tenancy`      | Projektowanie auth, tenantow, RBAC/ABAC             | Gdy dotykasz auth, rol, organizacji              | auth flow / wymagania          | auth architecture, enforcement points, risks                | ⭐⭐⭐⭐⭐ |
| Feature Flags Architect   | `/flags-architect`   | Projektowanie systemu feature flags                 | Dodawanie eksperymentow lub rolloutow            | feature change                 | flag taxonomy, evaluation architecture, rollout strategy    | ⭐⭐⭐     |
| Implementation Planner    | `/impl-plan`         | Rozbijanie architektury na kroki implementacji      | Po zaprojektowaniu feature                       | architecture spec              | phased tasks, files map, migration plan                     | ⭐⭐⭐⭐   |
| Principal Code Reviewer   | `/principal-review`  | Review jak od principal engineer                    | Przed merge PR                                   | diff / zmiany                  | approve/reject + critical issues                            | ⭐⭐⭐⭐   |
| Security Auditor          | `/security-audit`    | Audyt bezpieczenstwa aplikacji                      | Przed release lub po duzym feature               | repo / modul                   | vulnerabilities, exploit paths, fixes                       | ⭐⭐⭐⭐⭐ |
| Test Strategy Designer    | `/test-strategy`     | Projektowanie sensownych testow                     | Po implementacji feature                         | feature spec                   | test matrix, edge cases, CI plan                            | ⭐⭐⭐     |
| Observability Architect   | `/observability`     | Monitoring, Sentry, telemetry                       | Konfiguracja observability                       | modul / feature                | instrumentation plan, metrics, alerts                       | ⭐⭐⭐     |
| ADR Writer                | `/adr-writer`        | Dokumentowanie decyzji architektonicznych           | Po decyzjach architektonicznych                  | decision context               | ADR document                                                | ⭐⭐       |

## Jak wyglada workflow pracy

1. Start nowego feature
   Command: `/architect-sdd`
   Agent tworzy:

- spec
- architecture
- plan implementacji

2. Sprawdzenie runtime Next.js
   Command: `/next-runtime`
   Sprawdza:

- server vs client
- actions
- caching
- edge vs node

3. Jesli feature dotyczy auth / tenantow
   Command: `/auth-tenancy`
   Sprawdza:

- trust boundaries
- tenant propagation
- RBAC enforcement

4. Rozbijanie na zadania
   Command: `/impl-plan`
   Tworzy:

- kolejnosc PR
- mape plikow
- migration notes

5. Po implementacji
   Commands: `/review-boundaries`, `/principal-review`
   Sprawdza:

- architecture
- maintainability
- code quality

6. Przed release
   Commands: `/security-audit`, `/test-strategy`, `/observability`

7. Dokumentacja decyzji
   Command: `/adr-writer`

## Co jest najwazniejsze

Jesli mialbym wybrac minimum, ktore daje 80% wartosci:

- `/architect-sdd`
- `/review-boundaries`
- `/auth-tenancy`
- `/security-audit`
- `/impl-plan`
- `/principal-review`

To juz daje workflow enterprise architecture level.

## Bonus: agent, ktory polecam jeszcze dodac

Jesli bedziesz robil duzo projektow z tego boilerplate, dodaj jeszcze:

`Boilerplate Maintainer`

Command: `/boilerplate-maintainer`

Cel:

- pilnowanie, aby boilerplate byl clean template
- identyfikowanie kodu, ktory nie powinien byc w template
- sprawdzanie, czy moduly sa opcjonalne

To jest bardzo przydatne przy multi-template strategy.

## Pro tip dla Zencoder

Polecam stworzyc workflow: `SDD Feature Workflow`, ktory automatycznie odpala:

- `architect-sdd`
- `next-runtime`
- `impl-plan`
- `review-boundaries`
- `principal-review`
- `security-audit`

To daje pelny lifecycle feature development.

## Dodatkowo

Jesli chcesz, moge tez przygotowac:

`Ultimate Zencoder Agents Pack for Next.js Architects`

Czyli:

- 11 gotowych promptow agentow
- kazdy production-grade
- kazdy ~300-500 linii instrukcji
- zoptymalizowane pod Next.js 16 + modular monolith + tenancy + RBAC + feature flags

To jest poziom konfiguracji, ktory zwykle maja staff engineers w duzych firmach.
