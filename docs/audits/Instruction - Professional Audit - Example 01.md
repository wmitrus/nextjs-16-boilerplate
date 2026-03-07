# Profesjonalny audyt aplikacji Next.js 16 w architekturze Modular Monolith

## Cel dokumentu

Ten dokument opisuje **pełny, profesjonalny audyt architektury i implementacji** aplikacji zbudowanej w **Next.js 16** zgodnie z podejściem **Modular Monolith**, z naciskiem na:

- poprawność granic modułów,
- brak wycieków domenowych i infrastrukturalnych,
- ograniczanie blast radius,
- bezpieczeństwo aplikacji,
- poprawność autoryzacji i uwierzytelniania,
- spójność DI,
- poprawność warstw i kontraktów,
- jakość operacyjną, testową i dokumentacyjną,
- gotowość do dalszego rozwoju bez kosztownego refaktoru.

To nie jest zwykły code review. To jest **architektoniczno-bezpieczeństwowo-operacyjny audit framework**.

---

# 1. Zasady ogólne audytu

## 1.1. Co audyt ma wykryć

Audyt ma wykryć przede wszystkim:

- naruszenia granic modułów,
- niejawne zależności między modułami,
- przecieki domeny do UI, infrastruktury lub frameworka,
- przecieki frameworka do domeny,
- brak kontroli nad flow danych i uprawnień,
- zbyt szeroki blast radius zmian,
- duplikację logiki biznesowej,
- obchodzenie use case’ów przez bezpośredni dostęp do repozytoriów / ORM / zewnętrznych SDK,
- brak centralnych polityk auth/authz,
- błędy separacji Node / Edge / Client,
- błędy transakcyjne i spójności danych,
- ukryte couplingi przez helpery, utils, barrel exports, shared foldery,
- niejawne zależności runtime,
- brak testów na poziomie granic i kontraktów,
- niekontrolowane rozszerzanie odpowiedzialności modułów,
- niepełną dokumentację architektury.

## 1.2. Czego audyt nie może robić

Audyt nie może ograniczać się do:

- samego ESLint-a,
- samego test coverage,
- samego review route handlers,
- samego sprawdzenia katalogów,
- samego bezpieczeństwa HTTP,
- samego ORM/schema review.

Modular monolith można „udawać” strukturą folderów. Audyt musi sprawdzać **realne zależności i egzekwowalne granice**, a nie deklaracje.

## 1.3. Fundamentalna zasada oceny

Najważniejsze pytanie podczas audytu brzmi:

> Czy system jest zorganizowany tak, że poprawna implementacja jest łatwa, a błędna trudna lub niemożliwa?

Jeżeli zła praktyka jest technicznie łatwa, a dobra wymaga dyscypliny zespołu, to architektura jest jeszcze niedomknięta.

---

# 2. Artefakty wymagane przed audytem

Przed rozpoczęciem audytu należy zebrać następujące artefakty:

## 2.1. Artefakty kodowe

- pełne drzewo katalogów projektu,
- lista modułów biznesowych,
- lista modułów cross-cutting,
- lista punktów wejścia frameworka:
  - `app/`
  - route handlers,
  - server actions,
  - middleware / proxy / edge runtimes,
  - background jobs,
  - cron / queue workers,
- mapa providerów DI,
- lista repozytoriów i adapterów,
- lista integracji zewnętrznych,
- konfiguracja env,
- konfiguracja testów,
- konfiguracja lint / import rules / dep rules / boundary rules.

## 2.2. Artefakty architektoniczne

- diagram kontekstowy systemu,
- diagram modułów,
- diagram zależności między modułami,
- diagram przepływu requestu,
- diagram auth/authz,
- diagram danych i transakcji,
- macierz odpowiedzialności modułów,
- lista public API każdego modułu,
- lista zakazanych zależności.

## 2.3. Artefakty decyzyjne

- ADR-y dla kluczowych decyzji:
  - DI,
  - tenancy,
  - auth,
  - RBAC/ABAC,
  - feature flags,
  - eventing,
  - transakcje,
  - logging/observability,
  - Edge vs Node.

Brak tych dokumentów sam w sobie jest findingsiem audytowym.

---

# 3. Model oceny audytu

Każde znalezisko należy klasyfikować według dwóch osi:

## 3.1. Waga problemu

- **Critical** — narusza bezpieczeństwo, integralność danych, autoryzację lub granice modułów w sposób systemowy.
- **High** — powoduje wysoki blast radius, łamie architekturę lub prowadzi do częstych regresji.
- **Medium** — pogarsza maintainability, testowalność lub czytelność granic.
- **Low** — lokalny problem jakościowy, bez dużego ryzyka systemowego.

## 3.2. Typ problemu

- Boundary violation
- Domain leak
- Infrastructure leak
- Auth/AuthZ flaw
- Transactional integrity issue
- Runtime separation issue
- Observability gap
- Testing gap
- Documentation gap
- Operational risk
- Performance / scalability risk
- DX / maintainability risk

---

# 4. Faza 1 — Audyt makroarchitektury

## 4.1. Czy system ma rzeczywiste moduły

### Sprawdź

- czy istnieją wyraźne moduły biznesowe,
- czy moduł ma własne:
  - use case’y,
  - kontrakty,
  - model domenowy,
  - adaptery,
  - testy,
  - public API,
- czy moduł ma jasno określoną odpowiedzialność.

### Szukaj błędów

- moduły są tylko folderami bez realnych granic,
- wspólny `shared/` stał się „wysypiskiem wszystkiego”,
- moduły komunikują się bezpośrednio po implementacjach,
- logika biznesowa siedzi poza modułami,
- moduły są zdefiniowane według warstw technicznych zamiast zdolności biznesowych.

### Zabronione

- importowanie wnętrza innego modułu poza jego public API,
- wspólne repozytorium ORM dla wszystkich modułów,
- współdzielone serwisy biznesowe używane przez wszystko,
- globalny utils layer z logiką domenową.

## 4.2. Czy granice modułów są egzekwowalne

### Sprawdź

- reguły importów,
- boundary linting,
- dep-cruiser / madge / custom rules,
- zakazane ścieżki,
- public entrypoint modułu.

### Szukaj błędów

- można importować dowolny plik z dowolnego miejsca,
- barrel eksportuje za dużo,
- `index.ts` ukrywa niedozwolone zależności,
- testy obchodzą public API modułu i utrwalają złą strukturę.

### Zabronione

- głębokie importy do `internal/`, `infra/`, `repositories/`, `adapters/` innego modułu,
- importowanie typu lub encji tylko „dla wygody”, jeśli łamie granicę.

## 4.3. Czy blast radius jest kontrolowany

### Sprawdź

- co trzeba zmienić przy dodaniu nowego use case’a,
- ile modułów trzeba dotknąć przy zmianie reguły biznesowej,
- czy awaria integracji zewnętrznej rozszerza się na wiele modułów,
- czy błędna zmiana auth może otworzyć całą aplikację.

### Szukaj błędów

- jedna zmiana wymaga edycji w wielu niepowiązanych miejscach,
- wspólne helpery propagują regresje globalnie,
- jeden kontener DI albo jeden provider zasila zbyt dużo rzeczy,
- brak hermetyzacji integracji.

### Dobra praktyka

Zmiana lokalna powinna pozostawać lokalna. Jeżeli jedna decyzja rozlewa się po całym systemie, architektura nie jest wystarczająco modułowa.

---

# 5. Faza 2 — Audyt warstw i separacji odpowiedzialności

## 5.1. Domena

### Domena może zawierać

- encje,
- value objects,
- reguły biznesowe,
- polityki domenowe,
- serwisy domenowe,
- kontrakty wymagane przez use case’y.

### Domena nie może zawierać

- `NextRequest`, `NextResponse`, cookies, headers,
- Prisma/Drizzle/SQL,
- fetch do usług zewnętrznych,
- logger frameworkowy,
- env access,
- Sentry/telemetria zależna od vendorów,
- DTO związanych z HTTP/UI.

### Szukaj błędów

- domena zna strukturę sesji z frameworka,
- encja czyta env,
- polityka biznesowa wie o JWT lub Clerk,
- value object zależy od utilsa z web layer.

## 5.2. Use case / application layer

### Powinien robić

- orkiestrację,
- sprawdzanie uprawnień na poziomie aplikacyjnym,
- koordynację transakcji,
- korzystanie z kontraktów,
- mapowanie domeny do output DTO.

### Nie powinien robić

- bezpośrednich zapytań HTTP,
- bezpośrednich wywołań ORM bez kontraktu,
- renderowania UI,
- dostępu do frameworkowych request objects,
- mieszania logiki auth provider-specific z logiką biznesową.

### Szukaj błędów

- use case ma import Prisma client,
- use case czyta cookies,
- use case zna szczegóły route segmentów,
- use case zawiera formatowanie response dla React.

## 5.3. Interface / delivery layer

### Powinien robić

- walidację wejścia,
- ekstrakcję kontekstu requestu,
- wywołanie use case’a,
- mapowanie błędów na HTTP/UI,
- serializację.

### Nie powinien robić

- logiki biznesowej,
- bezpośredniego dostępu do repozytoriów,
- decyzji autoryzacyjnych rozsianych po handlerach,
- obchodzenia application layer.

### Szukaj błędów

- server action zapisuje bezpośrednio do DB,
- route handler wykonuje wszystkie reguły biznesowe sam,
- React Server Component woła repozytorium zamiast query use case.

## 5.4. Infrastructure layer

### Powinna robić

- implementować kontrakty,
- adaptować vendor APIs,
- ukrywać szczegóły ORM, cache, kolejki, email, storage,
- mapować dane techniczne na modele użyteczne dla app layer.

### Nie powinna robić

- definiować reguł biznesowych,
- decydować o uprawnieniach,
- stać się współdzielonym „smart layer”.

---

# 6. Faza 3 — Audyt zależności i DI

## 6.1. Czy DI jest architektoniczne, a nie dekoracyjne

### Sprawdź

- czy DI rozwiązuje realne granice modułów,
- czy kontrakty żyją po właściwej stronie granicy,
- czy implementacje infrastrukturalne są podmienialne,
- czy composition root jest jawny.

### Szukaj błędów

- DI tylko owija singletony,
- interfejsy są sztuczne i nie wynikają z granic,
- provider tworzy połowę systemu naraz,
- rejestracja zależności jest rozproszona i trudna do śledzenia.

## 6.2. Composition root

### Musi być

- jednoznaczny,
- zależny od runtime,
- świadomy Node/Edge,
- testowalny,
- możliwie cienki.

### Nie może

- zawierać logiki biznesowej,
- wybierać implementacji na podstawie niejawnych side effectów,
- rejestrować wszystkiego globalnie bez zakresu.

## 6.3. Zakres życia zależności

### Sprawdź

- request scope,
- singleton scope,
- stateless services,
- dostęp do cache i klienta DB,
- bezpieczeństwo współdzielenia stanu.

### Szukaj błędów

- request-specific context w singletonie,
- mutable state współdzielony między requestami,
- auth context cache’owany globalnie,
- tenant context przeciekający między requestami.

## 6.4. Zakazane wzorce DI

- service locator ukryty jako helper,
- import kontenera z dowolnego miejsca,
- dynamiczne `resolve()` w logice biznesowej,
- zależności opcjonalne maskujące złą architekturę,
- runtime branching „bo może działać wszędzie”.

---

# 7. Faza 4 — Audyt boundary rules i domain leaks

## 7.1. Boundary matrix

Dla każdego modułu przygotuj tabelę:

- co może importować,
- czego nie może importować,
- jakie public API wystawia,
- jakie use case’y udostępnia,
- jakie eventy publikuje,
- jakie kontrakty konsumuje.

## 7.2. Domain leaks do UI

### Szukaj

- React components znają szczegóły encji,
- UI podejmuje decyzje domenowe,
- formularz sam interpretuje reguły biznesowe,
- statusy biznesowe są składane ad hoc w komponentach.

## 7.3. Domain leaks do infra

### Szukaj

- repozytoria wymuszają kształt domeny przez schema ORM,
- domena dopasowana do tabel zamiast do biznesu,
- use case zna SQL-specific constraints.

## 7.4. Framework leaks

### Szukaj

- `next/*` importowane poza delivery layer,
- cookies/headers znane aplikacji lub domenie,
- cache revalidation jako część domeny,
- redirect/notFound wykorzystywane jako mechanizm biznesowy.

## 7.5. Shared layer leaks

### Najczęstsze czerwone flagi

- `shared/utils` zawiera logikę domenową,
- `shared/types` eksportuje wszystko dla wszystkich,
- `shared/lib` staje się boczną furtką między modułami,
- wspólne DTO służą wielu bounded contexts bez jasnego właściciela.

---

# 8. Faza 5 — Audyt auth, authz, identity i tenancy

## 8.1. Uwierzytelnianie

### Sprawdź

- jeden punkt ekstrakcji identity,
- jawny model `CurrentUser` / `Principal`,
- brak vendor lock-in w domenie,
- bezpieczne traktowanie niezalogowanego użytkownika.

### Szukaj błędów

- różne formaty użytkownika w różnych miejscach,
- bezpośrednie odwołania do Clerk/Auth.js/Supabase w use case’ach,
- brak jawnego modelu anonymous vs authenticated.

## 8.2. Autoryzacja

### Sprawdź

- czy jest centralna polityka,
- czy decyzje authz są wykonywane blisko use case’a,
- czy istnieją testy negatywne,
- czy ownership/tenant/org scope nie są pomijane.

### Szukaj błędów

- auth tylko w UI,
- auth tylko w middleware,
- handler sprawdza rolę, ale use case już nie,
- query returns data spoza tenant scope,
- brak rozróżnienia między permission do akcji a visibility danych.

### Zabronione

- poleganie wyłącznie na ukrywaniu przycisków,
- poleganie wyłącznie na middleware path-based,
- poleganie wyłącznie na client-side guards.

## 8.3. Tenancy

### Sprawdź

- skąd pochodzi tenant context,
- jak jest walidowany,
- czy każdy use case wymagający tenant scope dostaje go jawnie,
- czy repozytoria wymuszają tenant filters,
- czy testowane są próby cross-tenant access.

### Szukaj błędów

- tenant id z UI bez walidacji membership,
- zapomniane filtry w query,
- global cache bez tenant key,
- eventy i joby bez tenant context.

### Critical findings

- możliwość odczytu danych obcej organizacji,
- możliwość modyfikacji danych spoza scope użytkownika,
- logowanie lub cache z mieszaniem tenantów.

---

# 9. Faza 6 — Audyt danych, transakcji i spójności

## 9.1. Transakcje

### Sprawdź

- gdzie zaczynają się i kończą transakcje,
- czy granica transakcji jest zgodna z use case’em,
- czy side effecty zewnętrzne nie są wykonywane przed commit,
- czy istnieje outbox / retry strategy, jeśli potrzeba.

### Szukaj błędów

- dwa repozytoria aktualizowane bez transakcji,
- email/webhook wysyłany przed commit,
- cache invalidation przed trwałym zapisem,
- use case po części kończy się sukcesem, po części porażką bez kompensacji.

## 9.2. Integralność modelu

### Sprawdź

- czy invariants są wymuszane w domenie lub app layer,
- czy walidacja nie jest wyłącznie na froncie,
- czy ważne ograniczenia nie siedzą tylko w DB.

### Szukaj błędów

- reguła biznesowa istnieje wyłącznie w formularzu,
- status przejścia można ominąć przez bezpośredni zapis,
- update partial pozwala złamać invariants.

## 9.3. Concurrency i idempotencja

### Sprawdź

- czy mutacje są odporne na retry,
- czy istnieją idempotency keys tam, gdzie potrzeba,
- czy race conditions są możliwe przy podwójnym submit,
- czy optimistic/pessimistic concurrency jest świadome.

---

# 10. Faza 7 — Audyt Next.js 16 runtime i boundary frameworkowych

## 10.1. Rozdział Client / Server / Edge / Node

### Sprawdź

- które moduły mogą działać wyłącznie w Node,
- które wejścia są Edge-safe,
- czy client components nie importują server-only kodu,
- czy server-only jest egzekwowane.

### Szukaj błędów

- przypadkowy import Node API do Edge,
- przeciek sekretów przez client bundle,
- shared module używany jednocześnie przez client i server mimo niezgodności,
- use case zależny od runtime bez jawnego kontraktu.

## 10.2. Server Actions

### Sprawdź

- czy action jest tylko transportem do use case,
- walidację inputu,
- auth/authz,
- CSRF model,
- obsługę błędów i serializacji.

### Szukaj błędów

- action bez walidacji,
- action bez authz,
- action wywołuje repo bezpośrednio,
- action zwraca zbyt dużo szczegółów błędu.

## 10.3. Route Handlers

### Sprawdź

- spójność z use case layer,
- jawne DTO input/output,
- brak business logic in handler,
- rate limiting, logging, error mapping.

## 10.4. Caching i revalidation

### Sprawdź

- kto odpowiada za invalidation,
- czy cache key zawiera tenant/user scope,
- czy statyczne cache nie ujawnia prywatnych danych,
- czy revalidation nie obchodzi autoryzacji.

### Szukaj błędów

- cache współdzielony między tenantami,
- dane użytkownika w cache publicznym,
- niejawne cache w warstwie query prowadzące do starych lub obcych danych.

---

# 11. Faza 8 — Audyt bezpieczeństwa

## 11.1. Threat modeling

Dla każdego modułu określ:

- zasoby chronione,
- wejścia zewnętrzne,
- powierzchnie ataku,
- ścieżki eskalacji uprawnień,
- potencjalne skutki naruszenia,
- blast radius incydentu.

## 11.2. Checklist bezpieczeństwa aplikacyjnego

### Input

- walidacja schemą,
- normalizacja danych,
- limity wielkości payloadów,
- bezpieczne parsowanie plików,
- ochrona przed mass assignment.

### Output

- brak wycieku PII/sekretów,
- kontrola field-level exposure,
- bezpieczne mapowanie błędów,
- brak stack traces dla użytkownika.

### Auth

- każda mutacja musi mieć authn i authz,
- odczyt wrażliwych danych musi mieć authz,
- ownership musi być sprawdzany server-side.

### Web security

- CSRF,
- XSS,
- SSRF,
- open redirect,
- IDOR/BOLA,
- broken access control,
- upload abuse,
- deserialization risks,
- host header issues,
- cookie security,
- header hardening.

## 11.3. Szczególnie szukaj

- IDOR przez `id` z URL bez ownership check,
- BOLA w nested resources,
- brak tenant scoping w listach i detailach,
- server action z ukrytym inputem roli lub tenant id,
- webhooks bez podpisów,
- zbyt szerokie service tokens,
- env secrets dostępne z client bundle,
- logowanie tokenów, maili, danych prywatnych.

---

# 12. Faza 9 — Audyt obserwowalności i operacyjności

## 12.1. Logging

### Sprawdź

- czy logi mają correlation/request id,
- czy można prześledzić use case end-to-end,
- czy logi nie łamią granic modułów,
- czy logowanie jest ustandaryzowane.

### Szukaj błędów

- brak informacji, który use case zawiódł,
- logowanie w domenie vendor-specific loggerem,
- PII w logach,
- niejednolity format logów.

## 12.2. Metrics i tracing

### Sprawdź

- opomiarowanie kluczowych mutacji,
- błędy auth,
- błędy integracji,
- opóźnienia DB,
- opóźnienia zależne od modułu,
- retry i failure rate.

## 12.3. Incident blast radius

### Zapytaj

- co się stanie, gdy padnie DB,
- co się stanie, gdy padnie auth provider,
- co się stanie, gdy padnie storage/email/cache,
- czy jeden moduł może nadal działać częściowo.

Brak odpowiedzi operacyjnej oznacza niedojrzałość architektury.

---

# 13. Faza 10 — Audyt testów

## 13.1. Minimalny profesjonalny zestaw testów

Muszą istnieć testy:

- domeny,
- use case’ów,
- kontraktów repozytoriów,
- boundary rules,
- authz negative paths,
- cross-tenant isolation,
- request entrypoints,
- regresji dla wcześniej znalezionych bugów.

## 13.2. Czego nie uznawać za wystarczające

Nie wystarczy:

- wysoki coverage,
- same testy E2E,
- same snapshoty,
- same happy pathy,
- testowanie tylko UI.

## 13.3. Szczególnie wymagane testy architektoniczne

### Testy granic

- moduł A nie importuje wnętrza modułu B,
- domena nie importuje frameworka,
- app layer nie importuje ORM bez kontraktu,
- client nie importuje server-only.

### Testy authz

- użytkownik bez uprawnień dostaje odmowę,
- użytkownik z innego tenantu nie widzi danych,
- UI może pokazać błąd, ale serwer i tak blokuje.

### Testy blast radius

- awaria adaptera nie wywraca całej ścieżki bez kontrolowanego błędu,
- timeout integracji nie powoduje częściowego zapisu bez kompensacji.

---

# 14. Faza 11 — Audyt dokumentacji

## 14.1. Dokumentacja obowiązkowa

Powinny istnieć:

- opis modułów,
- public API modułów,
- zasady importów,
- zasady DI,
- zasady auth/authz,
- zasady tenancy,
- zasady transakcji,
- zasady eventów i side effectów,
- runtime matrix Node/Edge/Client,
- playbook incidentowy,
- diagramy architektoniczne.

## 14.2. Czerwone flagi dokumentacyjne

- architektura istnieje tylko „w głowie autora”,
- brak właściciela modułu,
- brak opisu granic,
- brak opisu dozwolonych zależności,
- brak uzasadnienia decyzji.

---

# 15. Diagramy, które trzeba mieć

## 15.1. Diagram modułów

Powinien pokazywać:

- moduły biznesowe,
- moduły wspólne,
- dozwolone zależności,
- public API modułów,
- zakazane kierunki zależności.

## 15.2. Diagram przepływu requestu

Od:

- route / action / component,

Przez:

- input validation,
- authn,
- authz,
- use case,
- repo/contracts,
- infra,
- logging,
- output mapping.

## 15.3. Diagram auth/authz/tenant

Powinien pokazać:

- skąd bierze się identity,
- gdzie ustala się tenant,
- gdzie wykonuje się authorization decision,
- gdzie wymuszany jest data scope.

## 15.4. Diagram transakcji i side effectów

Powinien pokazać:

- granice transakcji,
- moment commit,
- outbox/retry,
- side effecty po commit.

## 15.5. Diagram runtime

Powinien pokazać, co działa w:

- Client,
- Server,
- Node,
- Edge,
- background workers.

---

# 16. Narzędzia wspierające audyt

## 16.1. Statyczna analiza

- ESLint custom rules,
- import/no-restricted-paths,
- dependency-cruiser,
- madge,
- knip,
- ts-prune,
- typescript project boundaries,
- custom codemods / arch tests.

## 16.2. Testy i bezpieczeństwo

- Vitest / Jest,
- Playwright,
- contract tests,
- integration tests,
- semgrep,
- CodeQL,
- dependency audit,
- secret scanning,
- SAST/DAST tam, gdzie ma sens.

## 16.3. Obserwowalność

- Sentry,
- OpenTelemetry,
- structured logging,
- request correlation,
- error budgets / dashboards.

Uwaga: narzędzia nie zastąpią audytu architektonicznego. One tylko wspierają wykrywanie symptomów.

---

# 17. Pełna checklista audytowa

## 17.1. Struktura modułów

- [ ] Czy każdy moduł ma pojedynczą, zrozumiałą odpowiedzialność?
- [ ] Czy każdy moduł ma własne public API?
- [ ] Czy istnieją zakazane importy do wnętrza innych modułów?
- [ ] Czy `shared/` nie zawiera logiki domenowej wielu modułów?
- [ ] Czy można usunąć moduł bez naruszenia połowy systemu?

## 17.2. Warstwy

- [ ] Czy domena jest czysta od frameworka i infra?
- [ ] Czy use case’y nie wykonują bezpośrednio ORM/HTTP?
- [ ] Czy delivery layer jest cienki?
- [ ] Czy infra tylko implementuje kontrakty?

## 17.3. DI

- [ ] Czy composition root jest jawny?
- [ ] Czy nie ma service locatora?
- [ ] Czy request context nie przecieka do singletonów?
- [ ] Czy kontrakty są zdefiniowane po właściwej stronie granicy?

## 17.4. Auth/AuthZ/Tenancy

- [ ] Czy identity jest znormalizowane?
- [ ] Czy authz jest wykonywany server-side?
- [ ] Czy tenant scope jest wymuszany w każdym wrażliwym use case?
- [ ] Czy istnieją testy cross-tenant isolation?
- [ ] Czy ownership checks są wszędzie tam, gdzie trzeba?

## 17.5. Dane i transakcje

- [ ] Czy granice transakcji są jawne?
- [ ] Czy side effecty nie dzieją się przed commit?
- [ ] Czy invariants są wymuszane poza UI?
- [ ] Czy mutacje są odporne na retry/double submit?

## 17.6. Next.js runtime

- [ ] Czy client/server/edge/node są rozdzielone?
- [ ] Czy server actions nie obchodzą use case layer?
- [ ] Czy client bundle nie zawiera sekretów?
- [ ] Czy cache nie miesza tenantów/użytkowników?

## 17.7. Security

- [ ] Czy każda mutacja ma walidację inputu?
- [ ] Czy list/detail endpoints nie mają IDOR/BOLA?
- [ ] Czy błędy nie ujawniają zbyt dużo?
- [ ] Czy logi nie zawierają PII/sekretów?
- [ ] Czy webhooki mają weryfikację podpisu?

## 17.8. Testy

- [ ] Czy są testy granic architektonicznych?
- [ ] Czy są testy negatywne authz?
- [ ] Czy są testy kontraktów repozytoriów?
- [ ] Czy istnieją regresje dla historycznych bugów?

## 17.9. Dokumentacja

- [ ] Czy istnieje diagram modułów?
- [ ] Czy istnieje runtime matrix?
- [ ] Czy są ADR-y dla decyzji krytycznych?
- [ ] Czy dokumentacja opisuje zakazy, nie tylko zalecenia?

---

# 18. Jak wykonywać audyt krok po kroku

## Krok 1 — Inwentaryzacja systemu

Zbierz strukturę kodu, moduły, public API, entrypointy, adaptery, integracje, env i testy.

## Krok 2 — Zbuduj dependency map

Narysuj realne zależności importów i zależności runtime. Osobno zaznacz zależności dozwolone i rzeczywiste.

## Krok 3 — Zdefiniuj expected architecture

Opisz jak system **powinien** wyglądać: moduły, warstwy, public API, zakazane kierunki importów.

## Krok 4 — Porównaj actual vs expected

Każde odchylenie sklasyfikuj jako finding.

## Krok 5 — Przejdź przez request flows

Dla najważniejszych use case’ów prześledź cały przepływ od wejścia do DB i side effectów.

## Krok 6 — Przejdź przez security-critical flows

Sprawdź logowanie, odczyty wrażliwych danych, mutacje, tenant switching, role, ownership.

## Krok 7 — Przejdź przez failure scenarios

Sprawdź co się dzieje przy timeoutach, wyjątkach adapterów, błędach DB, retry, race condition.

## Krok 8 — Przejdź przez test suite

Oceń nie tylko ilość testów, ale czy testują architekturę i granice.

## Krok 9 — Oceń dokumentację

Zweryfikuj czy nowy developer odtworzy poprawny model systemu wyłącznie z dokumentów.

## Krok 10 — Wydaj raport końcowy

Raport musi zawierać:

- executive summary,
- listę findings,
- ryzyko biznesowe,
- priorytety napraw,
- quick wins,
- refaktory strategiczne,
- listę brakujących guardrails.

---

# 19. Szablon raportu końcowego

## Executive Summary

- ogólna ocena architektury,
- dojrzałość modułowości,
- największe ryzyka,
- gotowość do dalszego rozwoju.

## Findings

Dla każdego findingsu:

- ID,
- tytuł,
- kategoria,
- waga,
- lokalizacja,
- opis,
- dlaczego to problem,
- scenariusz ryzyka,
- rekomendacja naprawy,
- czy wymaga ADR/doc/test guardrail.

## Priorytety działań

- P0 — natychmiast,
- P1 — przed dalszym rozwojem,
- P2 — przy najbliższym większym refaktorze,
- P3 — poprawa jakości długoterminowej.

---

# 20. Ostateczne kryteria uznania architektury za dojrzałą

Aplikacja Next.js 16 w modelu Modular Monolith jest dojrzała wtedy, gdy:

- granice modułów są jawne i egzekwowalne,
- domena jest czysta,
- use case’y są jedynym miejscem orkiestracji logiki biznesowej,
- auth/authz/tenant scope są wykonywane po stronie serwera i testowane negatywnie,
- DI nie ukrywa architektury, tylko ją wzmacnia,
- runtime boundaries są kontrolowane,
- zmiana lokalna nie powoduje globalnego blast radius,
- dokumentacja odzwierciedla rzeczywistość,
- testy chronią granice, a nie tylko zachowanie UI,
- awaria jednego adaptera nie kompromituje całego systemu,
- zespół ma guardraile, które utrudniają łamanie zasad.

Jeżeli choć jeden z tych punktów jest słaby, projekt może wyglądać profesjonalnie, ale nadal być architektonicznie kruchy.

---

# 21. Najważniejsza zasada końcowa

Najlepszy modular monolith to nie ten, który ma najładniejsze foldery.

Najlepszy modular monolith to ten, w którym:

- granice są czytelne,
- błędy są lokalne,
- bezpieczeństwo jest systemowe,
- uprawnienia są nie do obejścia,
- framework nie zalewa domeny,
- a zła implementacja szybko wpada w guardraile.

To właśnie powinien potwierdzić profesjonalny audyt.

---

# 22. Wersja praktyczna dla boilerplate Next.js 16 z układem `src/modules`, `src/core`, `app`, `actions`, `infra`

Ta sekcja przekłada ogólne zasady audytu na **praktyczny model review i egzekwowania architektury** dla typowego boilerplate o strukturze zbliżonej do:

```text
src/
├── app/
├── actions/
├── core/
├── modules/
├── infra/
├── shared/   (opcjonalnie i bardzo ograniczone)
```

Celem tej sekcji jest odpowiedzieć nie tylko na pytanie **co sprawdzać**, ale przede wszystkim **jak sprawdzać** oraz **jakie reguły wdrożyć, aby błędy były trudne do popełnienia**.

---

# 23. Docelowy model odpowiedzialności katalogów

## 23.1. `src/modules/*`

To jest **centrum systemu biznesowego**. Każdy moduł powinien reprezentować spójny capability slice, a nie warstwę techniczną.

Przykład:

```text
src/modules/
├── identity/
├── organizations/
├── billing/
├── projects/
├── feature-flags/
└── audit-log/
```

Każdy moduł powinien mieć możliwie podobną strukturę, np.:

```text
src/modules/projects/
├── public-api.ts
├── application/
├── domain/
├── contracts/
├── infra/
├── presentation/   (opcjonalnie, jeśli lokalizujesz query mappers / presenters przy module)
└── tests/
```

### Moduł może zawierać

- domenę modułu,
- use case’y modułu,
- kontrakty modułu,
- implementacje modułowe specyficzne dla tego modułu,
- testy modułowe,
- publiczny entrypoint modułu.

### Moduł nie może

- importować wnętrza innego modułu,
- wystawiać całego wnętrza przez barrel,
- używać innego modułu przez jego prywatne pliki,
- wrzucać przypadkowych helperów „bo się przydadzą”.

## 23.2. `src/core/`

`core` nie jest miejscem na „wspólne wszystko”. To powinno być **jądro architektoniczne**, a nie drugi shared folder.

### `core` może zawierać

- kontrakty przekrojowe,
- tokeny DI,
- primitive abstractions,
- zasady env access,
- wspólne polityki architektoniczne,
- typy fundamentalne używane przez wiele modułów, ale wyłącznie wtedy, gdy są naprawdę cross-cutting.

### `core` nie może zawierać

- logiki biznesowej konkretnego modułu,
- implementacji vendor-specific,
- feature logic,
- „skrótów” do repozytoriów czy frameworka,
- utili, które faktycznie należą do konkretnego bounded context.

### Najczęstszy błąd

`core/` zaczyna pełnić rolę „supermodułu”, od którego zależy wszystko. To jedna z najgroźniejszych form ukrytego couplingu.

## 23.3. `src/infra/`

To warstwa integracji i infrastruktury współdzielonej.

### `infra` może zawierać

- DB client setup,
- adaptery do vendorów,
- logger setup,
- telemetry setup,
- cache clients,
- email/storage/queue adapters,
- implementacje przekrojowych kontraktów.

### `infra` nie może zawierać

- logiki use case’ów,
- decyzji autoryzacyjnych,
- reguł domenowych,
- orchestration flow,
- zależności od UI.

### Ważne

Jeżeli implementacja jest **ściśle modułowa**, rozważ pozostawienie jej przy module zamiast promować ją do globalnego `infra`.

## 23.4. `src/app/`

To framework delivery layer dla App Router.

### `app` może zawierać

- route segments,
- route handlers,
- server component entrypoints,
- layout/page/loading/error,
- minimalny transport do use case’ów,
- framework-specific orchestration na poziomie wejścia/wyjścia.

### `app` nie może zawierać

- reguł biznesowych,
- bezpośredniego dostępu do DB,
- obchodzenia application layer,
- lokalnych „mini-serwisów” biznesowych.

## 23.5. `src/actions/`

To transport mutacji, nie application layer.

### `actions` mogą zawierać

- input parsing,
- auth context extraction,
- wywołanie use case’a,
- mapowanie błędu na rezultat UI,
- ewentualne triggerowanie revalidation po sukcesie.

### `actions` nie mogą zawierać

- logiki biznesowej,
- bezpośrednich zapisów do bazy,
- bezpośredniej decyzji biznesowej „czy wolno”, jeśli nie jest delegowana do use case/policy,
- zależności do prywatnych repozytoriów.

---

# 24. Docelowe reguły importów między katalogami

Poniżej znajduje się praktyczna macierz dozwolonych zależności.

## 24.1. Reguły wysokiego poziomu

### `app` może importować

- `modules/*/public-api`
- wybrane `core/*`
- wybrane `infra/*` tylko tam, gdzie to czysto framework/setup-level i nie obchodzi application boundary
- `actions/*`

### `app` nie może importować

- `modules/*/domain/*`
- `modules/*/application/*` z pominięciem `public-api`, jeśli polityka zespołu wymaga tylko public entrypointów
- `modules/*/infra/*`
- prywatnych kontraktów czy implementacji repozytoriów

### `actions` mogą importować

- `modules/*/public-api`
- `core/*`
- bardzo ograniczone framework helpers

### `actions` nie mogą importować

- `infra/db/*` bezpośrednio
- `modules/*/infra/*`
- `modules/*/domain/*` bez use case’a
- cudzych prywatnych utili

### `modules/*/domain` może importować

- własne `domain/*`
- własne `contracts/*`
- bardzo mały zestaw architektonicznych primitives z `core`

### `modules/*/domain` nie może importować

- `next/*`
- `react`
- `infra/*`
- ORM
- auth vendora
- `app/*`
- `actions/*`

### `modules/*/application` może importować

- własny `domain/*`
- własny `contracts/*`
- public API innych modułów, jeśli architektura dopuszcza synchroniczne zależności między use case’ami
- `core/*`

### `modules/*/application` nie może importować

- `next/*`
- `app/*`
- `actions/*`
- globalnego DB clienta bez kontraktu
- implementacji repozytorium z innego modułu

### `modules/*/infra` może importować

- własne `contracts/*`
- własne `domain/*` wyłącznie do mapowania
- `infra/*`
- `core/*`

### `modules/*/infra` nie może importować

- `app/*`
- `actions/*`
- application layer innego modułu z pominięciem publicznych kontraktów

### `core/*` nie powinno importować modułów biznesowych

To bardzo ważne. W przeciwnym razie `core` przestaje być core i staje się centralnym sprzęgaczem.

---

# 25. Konkretna checklista review dla struktury boilerplate

## 25.1. Review `src/modules`

Dla każdego modułu sprawdź:

- [ ] Czy moduł ma jednoznaczny cel biznesowy?
- [ ] Czy posiada własny `public-api.ts` lub równoważny entrypoint?
- [ ] Czy public API eksportuje tylko to, co naprawdę ma być publiczne?
- [ ] Czy use case’y są jedynym oficjalnym wejściem do mutacji i zapytań?
- [ ] Czy moduł nie importuje prywatnych plików innego modułu?
- [ ] Czy nazwy plików i folderów odzwierciedlają język domeny, a nie techniczny slang?
- [ ] Czy moduł nie zawiera przypadkowego `utils.ts`, który miesza różne odpowiedzialności?
- [ ] Czy wszystkie wyjątki od reguł są opisane w ADR lub komentarzu architektonicznym?

### Szukaj szczególnie

- `index.ts` eksportującego wszystko,
- helperów z przypadkową logiką biznesową,
- bezpośrednich importów repo z obcych modułów,
- shared typów kopiujących model DB zamiast modelu domeny,
- use case’ów zależnych od request/cookies.

## 25.2. Review `src/core`

- [ ] Czy każdy plik w `core` jest naprawdę przekrojowy?
- [ ] Czy nie ma tam logiki konkretnego modułu?
- [ ] Czy kontrakty w `core` są neutralne biznesowo?
- [ ] Czy tokeny DI są stabilne i jednoznaczne?
- [ ] Czy `core` nie importuje modułów biznesowych?
- [ ] Czy env access jest scentralizowany i walidowany?

### Czerwona flaga

Jeżeli po usunięciu jednego modułu biznesowego trzeba zmieniać dużo w `core`, to znaczy, że `core` wchłonął logikę modułu.

## 25.3. Review `src/infra`

- [ ] Czy `infra` implementuje kontrakty, a nie reguły biznesowe?
- [ ] Czy vendor code jest odizolowany od domeny?
- [ ] Czy adaptery mają jednoznaczny owner i zakres?
- [ ] Czy retry/timeout/circuit breaking są tam, gdzie mają być?
- [ ] Czy nie ma „sprytnego” shared service, który robi za pół systemu?

## 25.4. Review `src/app`

- [ ] Czy strony/route handlers są cienkie?
- [ ] Czy każdy entrypoint deleguje do modułu/use case’a?
- [ ] Czy input jest walidowany?
- [ ] Czy output nie ujawnia zbyt dużo danych?
- [ ] Czy błędy są mapowane świadomie?
- [ ] Czy frameworkowe funkcje (`redirect`, `notFound`, cookies, headers) nie wlewają się do domeny?

## 25.5. Review `src/actions`

- [ ] Czy action jest tylko transportem?
- [ ] Czy action waliduje dane wejściowe?
- [ ] Czy action nie zapisuje bezpośrednio do DB?
- [ ] Czy action nie robi authz tylko „na skróty”?
- [ ] Czy action nie przyjmuje ukrytych pól typu `role`, `tenantId`, `ownerId` bez weryfikacji server-side?

---

# 26. Checklisty tematyczne do PR review

## 26.1. PR dodający nowy moduł

- [ ] Czy nowy moduł ma jasno określony bounded context?
- [ ] Czy ma własny public API?
- [ ] Czy ma zdefiniowane kontrakty na granicy?
- [ ] Czy nie dubluje istniejącej odpowiedzialności innego modułu?
- [ ] Czy zależności do innych modułów są minimalne i uzasadnione?
- [ ] Czy dodano testy granic i testy auth/authz, jeśli dotyczy?
- [ ] Czy uzupełniono diagram modułów i dokumentację?

## 26.2. PR dodający nowy use case

- [ ] Czy use case siedzi w odpowiednim module?
- [ ] Czy cała logika biznesowa jest w module, a nie w action/route?
- [ ] Czy użyto kontraktów zamiast bezpośredniego ORM?
- [ ] Czy authz jest jawny i testowany?
- [ ] Czy tenant scope jest jawny i obowiązkowy, jeśli dotyczy?
- [ ] Czy side effecty są po commit lub przez outbox, jeśli to krytyczne?

## 26.3. PR dodający nową integrację zewnętrzną

- [ ] Czy vendor jest ukryty za adapterem/kontraktem?
- [ ] Czy failure modes są obsłużone?
- [ ] Czy sekret jest tylko server-side?
- [ ] Czy integracja nie przecieka do domeny?
- [ ] Czy zdefiniowano retry, timeout, observability?
- [ ] Czy blast radius awarii jest ograniczony?

## 26.4. PR zmieniający auth / role / tenancy

- [ ] Czy decyzja authz nadal jest server-side?
- [ ] Czy istnieją testy negatywne?
- [ ] Czy nie ma możliwości cross-tenant access?
- [ ] Czy ownership checks pozostają po stronie serwera?
- [ ] Czy cache kluczuje tenant/user scope?
- [ ] Czy dokumentacja auth matrix została zaktualizowana?

---

# 27. Co jest zabronione w praktycznym boilerplate

Poniższe wzorce powinny być traktowane jako domyślnie zabronione.

## 27.1. Zabronione importy

- `app/*` → `modules/*/infra/*`
- `app/*` → `infra/db/*` bezpośrednio
- `actions/*` → `infra/db/*` bezpośrednio
- `modules/*/domain/*` → `next/*`
- `modules/*/domain/*` → ORM / vendor auth / logger vendorowy
- `modules/*/application/*` → `app/*`
- `core/*` → `modules/*`
- `modules/A/*` → `modules/B/internal/*`

## 27.2. Zabronione zachowania

- server action zapisuje do DB z pominięciem use case’a,
- route handler sam wykonuje całą autoryzację i logikę,
- UI ukrywa przycisk i to ma „załatwiać” auth,
- tenant id przychodzi z klienta i jest bezrefleksyjnie używany,
- jedna shared funkcja modyfikuje zachowanie wielu modułów bez właściciela,
- core zawiera use case’y albo biznesowe reguły,
- barrel export ujawnia pliki prywatne,
- kompozycja DI jest osiągalna z całego kodu jako service locator,
- moduły komunikują się przez import implementacji zamiast kontraktów/public API.

## 27.3. Zabronione skróty „bo szybciej”

- bezpośredni Prisma/Drizzle client w action,
- auth check tylko w komponencie,
- query do bazy w page.tsx z pominięciem query service/use case,
- utils z walidacją biznesową poza modułem,
- statusy domenowe renderowane ad hoc bez wspólnej polityki mapowania.

---

# 28. Jakich błędów szukać w Twoim typie architektury

## 28.1. Boundary errors

Szukaj:

- deep imports między modułami,
- public API eksportującego implementacje,
- helperów będących bocznym kanałem komunikacji,
- testów importujących pliki prywatne modułu i przez to utrwalających złą granicę.

## 28.2. Domain leaks

Szukaj:

- obiektów domenowych serializowanych prosto do UI bez mapowania,
- use case’ów zwracających model ORM,
- domeny zależnej od request context,
- polityk domenowych znających role/session schema dostawcy auth.

## 28.3. Infrastructure leaks

Szukaj:

- Prisma/Drizzle types krążących po modułach,
- storage/email/cache SDK znanego application layer,
- Sentry/OpenTelemetry obecnych w domenie,
- DB transactions sterowanych w UI/route layer bez application coordinatora.

## 28.4. Blast radius issues

Szukaj:

- jednej funkcji shared używanej przez wiele modułów bez contract boundary,
- centralnego `services.ts`, od którego zależy pół systemu,
- globalnych enumów biznesowych używanych wszędzie,
- zmian auth/tenant wymagających edycji w kilkunastu miejscach.

## 28.5. Logical issues

Szukaj:

- logiki walidacji rozproszonej między client, action, use case i repo,
- częściowego zapisu bez pełnej transakcji,
- side effectów przed zapisem,
- braku idempotencji w create/update actions,
- rozjechania reguł między UI a backendem.

## 28.6. Auth issues

Szukaj:

- braku ownership check po stronie serwera,
- query filtrującego po `userId`, ale nie po `tenantId`,
- list endpoint ujawniających metadane spoza scope,
- admin flag w input DTO,
- authz zaimplementowanego tylko w middleware.

---

# 29. Minimalne guardraile do wdrożenia w CI

## 29.1. Guardraile architektoniczne

W CI powinny działać co najmniej:

- lint zakazanych importów,
- dependency-cruiser lub podobne reguły granic,
- wykrywanie cykli zależności,
- test architektoniczny sprawdzający brak `next/*` w domenie,
- test architektoniczny sprawdzający brak ORM w application/domain,
- test architektoniczny sprawdzający brak deep importów między modułami.

## 29.2. Guardraile bezpieczeństwa

- schema validation required na wszystkich mutacjach,
- testy negatywne authz,
- testy cross-tenant isolation,
- secret scanning,
- dependency vulnerability scan,
- semgrep/codeql dla podstawowych klas błędów.

## 29.3. Guardraile jakościowe

- brak nieużywanych eksportów/public APIs,
- brak cykli,
- spójne nazewnictwo modułów,
- obowiązkowy update dokumentacji przy zmianie granic, auth lub tenancy.

---

# 30. Przykładowa procedura audytu Twojego boilerplate krok po kroku

## Etap A — Mapowanie architektury

1. Wypisz wszystkie moduły w `src/modules`.
2. Dla każdego wskaż:
   - właściciela odpowiedzialności,
   - public API,
   - kontrakty,
   - zależności do innych modułów.
3. Sprawdź, czy `core` nie zawiera rzeczy modułowych.
4. Sprawdź, czy `app` i `actions` są tylko delivery layer.
5. Narysuj dependency graph.

## Etap B — Audyt runtime flow

Dla 5–10 najważniejszych ścieżek przejdź ręcznie:

1. wejście z `app` albo `actions`,
2. walidacja inputu,
3. ekstrakcja identity,
4. authorization decision,
5. use case,
6. repo/contracts,
7. transakcja,
8. side effecty,
9. logowanie,
10. output.

Na każdym etapie zapytaj:

- czy ta odpowiedzialność siedzi we właściwym miejscu,
- czy da się ją obejść,
- czy błąd tutaj naruszy tylko lokalny moduł, czy pół systemu.

## Etap C — Audyt auth i tenant isolation

1. Wybierz ścieżki create/read/update/delete.
2. Sprawdź użytkownika:
   - niezalogowanego,
   - zalogowanego bez roli,
   - zalogowanego z rolą,
   - użytkownika z innego tenant scope.
3. Sprawdź wszystkie listy, detale i nested resources.
4. Sprawdź cache i revalidation.
5. Sprawdź background flows i webhooki.

## Etap D — Audyt blast radius

1. Zmień regułę roli lub ownership.
2. Oceń ile miejsc trzeba ruszyć.
3. Zmień model jednego modułu.
4. Oceń czy inne moduły pękają.
5. Zmień jednego vendora auth albo email.
6. Oceń ile warstw zna tego vendora.

Jeżeli odpowiedź brzmi „bardzo dużo”, architektura nadal jest zbyt sprzężona.

---

# 31. Gotowa checklista do codziennego PR review

Poniższą checklistę można wkleić do pull request template.

## Architektura

- [ ] Zmiana nie narusza granic modułów.
- [ ] Nie dodano deep importów do wnętrza innych modułów.
- [ ] Nie dodano logiki biznesowej do `app` lub `actions`.
- [ ] `core` nie przejął odpowiedzialności konkretnego modułu.
- [ ] Zmiana nie zwiększa niepotrzebnie blast radius.

## Domain / Application

- [ ] Domena pozostała czysta od frameworka i infra.
- [ ] Use case zachowuje odpowiedzialność za orchestration.
- [ ] Nie dodano ORM/vendor dependencies do application/domain.

## Auth / Security

- [ ] Input jest walidowany po stronie serwera.
- [ ] Authz nie opiera się tylko na UI lub middleware.
- [ ] Tenant/user scope jest egzekwowany server-side.
- [ ] Brak możliwości IDOR/BOLA.
- [ ] Brak wycieku sekretów/PII.

## Dane / Transakcje

- [ ] Granica transakcji jest poprawna.
- [ ] Side effecty nie dzieją się przed trwałym zapisem.
- [ ] Zmiana jest odporna na retry/double submit, jeśli dotyczy.

## Testy / Dokumentacja

- [ ] Dodano lub zaktualizowano testy granic i logiki krytycznej.
- [ ] Dodano testy negatywne dla authz, jeśli dotyczy.
- [ ] Dokumentacja/diagramy zostały zaktualizowane, jeśli zmieniają się granice.

---

# 32. Ostateczna zasada dla Twojego boilerplate

W boilerplate Next.js 16 opartym o Modular Monolith celem nie jest tylko „ładna struktura”.

Celem jest osiągnięcie sytuacji, w której:

- `app` i `actions` są cienkimi wejściami,
- `modules` są prawdziwymi capability slices,
- `core` jest mały i stabilny,
- `infra` ukrywa vendorów,
- DI wzmacnia granice zamiast je rozmywać,
- auth i tenancy są nie do obejścia,
- a CI automatycznie łapie większość naruszeń, zanim trafią do review.

Dopiero wtedy review architektoniczny przestaje być heroiczną ręczną walką i staje się powtarzalnym procesem jakościowym.
