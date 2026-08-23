# Handoff — Security Audit Remediation Series

**Ten plik jest pamięcią serii. Przeczytaj go w całości, potem `AGENTS.md`.**
Właściciel repo: `wmitrus`, pisze po polsku — odpowiadaj po polsku.

## Start nowej sesji — przeczytaj najpierw

To jest **kontynuacja**, nie nowy projekt. Rozmowy, w której powstała faza 1,
już nie ma i **nie jest potrzebna** — cały kontekst jest w repo. Nie proś
użytkownika o streszczenie tego, co było.

| Co                    | Wartość                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faza 1                | PR #74, **zmergowany**, gałąź `claude/security-audit-multi-tenant-idor-e1y3yr`                                                                                                          |
| Zamknięte             | 16 case'ów. Ostatni wzorzec w katalogu: **SEC-46** (44 wpisy łącznie; numery SEC-XX tej serii nie są ciągłe — część case'ów rozszerzała istniejące wzorce)                              |
| **Następny case**     | **Case 17**, wzorzec **SEC-47**                                                                                                                                                         |
| Numeracja użytkownika | liczy findingi po swojemu i **jego numery nie pokrywają się z moimi**; jego ostatni to `15.` = Case 16 = SEC-46. Nie wyprowadzaj wzoru — weź **ostatni `## SEC-` z katalogu i dodaj 1** |
| Faza 2                | **NOWA gałąź, NOWY PR.** Nie doklejaj do #74 — jest zmergowany i bardzo duży                                                                                                            |
| Zostało               | użytkownik mówi, że jest **jeszcze drugie tyle znalezisk**                                                                                                                              |
| Backlog               | `PE-01 … PE-24`, **żaden nietriażowany**                                                                                                                                                |

**Pierwszy commit fazy 2** to nie case użytkownika, tylko **PE-24** —
zaakceptowany i świadomie odłożony właśnie do osobnego małego PR-a:
`varchar(128)` dla `audit_events.correlation_id`, a dla `request_id`
**najpierw audyt istniejących wierszy** (przed SEC-46 klient mógł podać własne
`x-request-id`, więc `text → uuid` może paść na danych historycznych).
Potwierdź to z użytkownikiem, zanim zaczniesz — nietriażowane ≠ „rób".

Gdzie leży dowód dla każdego zamkniętego case'a:

- `docs/ai/general/SECURITY_CODING_PATTERNS.md` — SEC-01 … SEC-46, każdy z
  ryzykiem, regułą, egzekwowaniem i powiązaniami. **To jest źródło prawdy o
  tym, czego już nie wolno powtórzyć.**
- `.copilot/tasks/2026-08-2*/plan.md` — przyczyna, decyzje użytkownika,
  rozwiązanie i falsyfikacja testów, per case.
- `docs/features/` — dokumentacja docelowa feature'ów (12, 13, 14, 20, 33, 35,
  ENV-requirements).
- `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` — PE-01 … PE-24.

## Jak pracujemy (standing instructions — nie negocjowalne)

1. Użytkownik podaje ponumerowane findingi z audytu, jeden na raz. Każdy = jeden case.
2. Protokół repo: `AGENTS.md` → odpowiedni `.claude/skills/*/SKILL.md` przez `Skill`. `src/proxy.ts` to middleware, nie `middleware.ts`.
3. **Testy regresyjne obowiązkowe** i muszą być **sfalsyfikowane** — celowo zepsuj kod, potwierdź że test pada, dopiero wtedy jest wart czegokolwiek.
4. **W każdym punkcie decyzyjnym: wyjaśnij i zapytaj** (`AskUserQuestion`). Decyzje produktowe/vendorowe/progowe/architektoniczne nie są moje.
5. **Kolejność pushu:** praca gotowa → wszystkie bramki zielone → **napisz użytkownikowi jakie zmienne ustawić na Vercelu** → **czekaj na potwierdzenie** → dopiero push. Naruszyłem to raz; użytkownik powtórzył dosłownie: _"najpierw masz mi napisać zmienne, push dopiero jak je ustawie"_.
6. **PR merguje wyłącznie użytkownik.** Nigdy ja — ani przyciskiem, ani
   `merge_pull_request`.
7. Dokumentuj **rozwiązanie każdego taska oraz jego powód i przyczynę** — w `.copilot/tasks/*/plan.md`, jako wzorzec `SEC-XX` w `docs/ai/general/SECURITY_CODING_PATTERNS.md`, **oraz w docelowej dokumentacji feature'a w `docs/features/`**. Ten ostatni punkt był przez pół serii pomijany — nie powtarzać.
8. Odroczone-ale-wartościowe pomysły → `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` jako PE-XX, odwołuj się po ID. Szczegóły niżej.
9. **Skanery i CI: raportuj, nie drąż.** Codacy, CodeRabbit i podobne — moim
   zadaniem jest **zakomunikować, że coś jest, i czekać na decyzję użytkownika**.
   Nie wolno mi z własnej inicjatywy pobierać findingów, kalibrować progów,
   instalować narzędzi ani odtwarzać analizy lokalnie — to spalanie usage
   użytkownika. Dosłownie: _"przestań sam marnować moje usage na codacy, ty masz
   mi tylko zakomunikować że jest i czekać na moje info, nigdy więcej tego nie
   rób"_. Bez criticali nie ruszamy tematu w ogóle. Wyjątek: nie ma wyjątku —
   nawet „szybkie sprawdzenie" jest naruszeniem.

## POSSIBLE_ENHANCEMENTS.md — plik żyje, trzeba go dalej updatować

`docs/ai/general/POSSIBLE_ENHANCEMENTS.md` jest w repo i **jest aktywnie
utrzymywany**. Stan: `PE-01` … `PE-24`, **żaden nietriażowany** — użytkownik
przejrzy backlog, gdy zdecyduje. `PE-24` jest jedynym wpisem oznaczonym jako
**zaakceptowany co do zasady**, tylko zaplanowany po fazie 1.

Obowiązek przy każdym case'ie:

- Wypłynął pomysł wartościowy, ale poza zakresem bieżącego case'a? Nowy wpis z
  kolejnym `PE-XX`, a w artefaktach taska tylko odwołanie po ID. Rationale
  zapisujemy **raz**, w PE.
- **Nigdy** nie implementuj wpisu z własnej inicjatywy. Nietriażowane ≠ zgoda.
- Gdy użytkownik striażuje wpis: zaktualizuj `Status` + krótka nota
  rozstrzygająca, wpisu **nie kasuj** — backlog jest też dziennikiem decyzji.

Reguła autorytatywna: `AGENTS.md`, sekcja "Possible Enhancements Backlog —
Check Every Task". Pointer dla Claude Code jest w `CLAUDE.md` (bo `AGENTS.md`
nie ładuje się automatycznie).

Ostatnie wpisy z tej serii: PE-24 (**zaakceptowany**, DB-level length constraints dla correlation_id/request_id — osobny mały PR **po** zmergowaniu obecnego), PE-23 (correlation_source w audycie), PE-22 (spójność odpowiedzi w with-auth.ts), PE-14 (nullable `waitlist_entries.organization_id`),
PE-15 (konstruktorowe mocki `vi.fn().mockImplementation()`), PE-16 (strict rate
limiting w Edge middleware), PE-17 (globalny purge `rate_limit_counters`),
PE-18 (durable backing dla login account bucket), PE-19 (weryfikacja
precedencji nagłówków Vercela), PE-20 (zakotwiczenie `trusted-proxy` na socket
peerze), PE-21 (HMAC + replay window i service identity dla internal API).

## Stan

16 case'ów zamkniętych (SEC-37…SEC-46).

Ostatnie pięć case'ów:

- **SEC-46** — trust model correlation/request ID. `correlationId` może przyjść
  od klienta, ale tylko jako `[A-Za-z0-9._:-]{1,128}` (**nie** UUID-only —
  correlation ID to metadana interop, nie credential); niepoprawny jest
  **zastępowany, nigdy truncate'owany**, bez 400. `requestId` **zawsze**
  serwerowy, `x-request-id` klienta w ogóle nieczytany. Kluczowa druga połowa:
  `terminalHandler` **nadpisuje** request headers, więc RSC/Node/audyt widzą tę
  samą wartość co klient. Odrzucenia logowane z `reason` + `receivedLength`
  (nigdy wartość) i **samplowane** (1., potem co setne). PE-23 = kolumna
  `correlation_source` w audycie.

- **SEC-45** — error boundary Edge pipeline'u przeniesiony **do środka**
  `withSecurity` (najgłębsza ramka trzymająca `RouteContext`). Wcześniej `catch`
  w proxy budował 500 poza `withHeaders()` → jedyna odpowiedź w aplikacji bez
  CSP/nosniff/correlation ID, logowana `console.error`. Body **zawsze
  generyczne**, bez gałęzi `NODE_ENV`; correlation **tylko w nagłówkach**;
  zewnętrzna siatka w proxy **nie generuje** drugiego correlation ID. PE-22 =
  cztery ręczne `NextResponse.json()` w `with-auth.ts` (dług konwencji, nie
  dziura — przechodzą przez finalizację).

- **SEC-42** — strict mode rate limitera: łańcuch Upstash → Postgres → fail closed; `OperationalSwitch` z override **tylko luzującym**; 7 endpointów security-critical (trzy nie miały limitu wcale: reset-password, signup, invite).
- **SEC-43** — jawny trust model klienckiego IP: `DEPLOYMENT_PROXY` + `TRUSTED_PROXY_CIDRS`, walidacja przez `ipaddr.js`, przejście XFF od prawej, **nigdy fikcyjne `127.0.0.1`**; untrusted → jeden stabilny bucket + WARN, audit log zapisuje `null`.
- **SEC-44** — internal API key: porównanie constant-time, rotacja current+previous, limiter nieudanych prób (**świadomie fail-open**, w przeciwieństwie do SEC-42 — asymetria udokumentowana), `maskedValue` usunięte z `EnvDiagnosticsEntry` u źródła. HMAC i mTLS **świadomie odłożone** jako PE z triggerem: pierwszy realny konsument service-to-service w produkcji.

Guardy statyczne (chodzą po `src/`, wywalają build): SEC-23 uuid-route-param, SEC-38 response-service, SEC-41 platform-admin, SEC-42 strict-rate-limit, SEC-43 client-ip.

## Pułapki, które już mnie kosztowały

- **`readMigrationSql()`** w skrypcie migracji to allowlist literalnych ścieżek (SEC-05/SEC-12). Nowa migracja **musi** trafić tam w tym samym commicie — inaczej Deploy Preview pada, a wszystkie lokalne bramki są zielone. Zdarzyło się: pięć case'ów z czerwonym preview.
- **Push protection GitHuba** blokuje realistycznie wyglądające sekrety w fixture'ach (`sk_live_...`). Używaj wartości bez kształtu prawdziwego klucza.
- **`vi.fn().mockImplementation(() => ({}))` w fabryce `vi.mock`** — fabryka odpala się po `vi.resetAllMocks()`, więc `new X()` rzuca. Używaj `class {}`.
- **Zielony test to nie dowód** — sprawdź, że mock faktycznie był wołany. Jeden test przechodził bo prawdziwy fallback zwracał tę samą wartość co asercja.
- **Sprawdzaj rodzeństwo** — ta sama klasa defektu prawie zawsze siedzi w sąsiedniej implementacji. Tak znalazłem bypass ABAC w `with-auth.ts`.
- Bramki: `pnpm typecheck`, `pnpm lint --fix` (**zawsze `--fix`**), `pnpm test`, `pnpm test:db`, `pnpm skott:check:only`, `pnpm depcheck`, `pnpm env:check`. Vitest: `--config vitest.unit.config.ts`.
- Użytkownik **prostuje mnie merytorycznie i zwykle ma rację** (feature flagi z `provider=db` są runtime-togglable; RFC 7239 standaryzuje `Forwarded`, nie algorytm dla XFF). Nie broń się — sprawdź i popraw.

## Otwarte

- **PR #74: wszystkie checki zielone, zmergowany przez użytkownika
  2026-08-23.** Faza 1 zamknięta.
- **Codacy — rozwiązane 2026-08-23 konfiguracją, nie kodem.** 11 annotacji
  rozpadło się tak:
  - **5 fałszywych alarmów** → użytkownik zignorował je w UI Codacy.
    `RESET_PASSWORD_PATH = '/api/auth/reset-password'` flagowane jako
    „hardcoded password", bo nazwa stałej zawiera `PASSWORD`; fixture E2E
    `'e2e-fixture-internal-api-key-not-a-secret'`; `hunter2` w teście
    SEC-45, który sprawdza właśnie, że ta wartość **nie wycieka**.
  - **2 × SQL** „Expected SET QUOTED_IDENTIFIER ON" → reguła **T-SQL /
    SQL Server** puszczona na migracje PostgreSQL. Użytkownik **wyłączył
    narzędzie tsql**. `.codacy.yml` celowo nietknięty.
  - **1 × bare URL** w `POSSIBLE_ENHANCEMENTS.md` → naprawione w kodzie.
  - **5 × złożoność** (`mapUserRow` 9/8, `listAll` 14/8, handler
    reset-password 65/50 linii, `verifyTurnstileToken` 51/50,
    `getLoginAbuseState` 10/8) — cała piątka to kod sprzed tego PR-a.
    Użytkownik **podniósł progi w UI** (60 linii / złożoność 10) — trzy z
    pięciu zeszły pod próg. Zostały dwie i te **zrefaktorowane**, nie
    obchodzone kolejnym podniesieniem progu:
    - `listAll` 14 → ~6: wydzielony `adminUserListPredicate()`; SQL bez zmian.
    - callback transakcji reset-password 65 → 31 NLOC: wydzielony
      `persistResetCredentials(tx, …)` przyjmujący **istniejący** `tx`, więc
      atomowy claim tokenu, obsługa wyścigu i granica transakcji zostają
      nietknięte (SEC-35/SEC-36).

    Weryfikacja: baseline zdjęty przed zmianą i identyczny po — unit 242/1905,
    DB 22/179, w tym izolacja tenantów i test współbieżnego resetu.
    **Zasada: dwie naturalne ekstrakcje i koniec — nie „upiększamy" kodu pod
    metrykę.**

  **Follow-up 2026-08-23**: polityka SQL przeniesiona z UI do repo — rootowy
  `.sqlfluff` (`dialect = postgres`, `templater = raw`) i `.sqlfluffignore`
  wykluczający `src/core/db/migrations/generated/**`. Codacy czyta `.sqlfluff`,
  więc config jest version-controlled i jedzie z każdym forkiem, zamiast
  siedzieć w panelu. Użytkownik przestawia w UI: **SQLFluff ON, SQLint OFF,
  TSQLLint OFF** — jeden linter SQL, nie trzy nakładające się. Świadomie
  **nie** wybieramy pojedynczych reguł SQLFluff: własna dokumentacja narzędzia
  ostrzega, że duży ręczny config to koszt utrzymania przy kolejnych majorach.
  `.codacy.yml` ma dodatkowo `sqlfluff.exclude_paths` na tę samą ścieżkę —
  to nie duplikat, tylko dwa różne konsumenty: `.sqlfluffignore` obsługuje
  lokalny SQLFluff/IDE/CI (natywnie wspierany, jest nawet flaga
  `--disregard-sqlfluffignores`), a `.codacy.yml` mówi wprost, co ma zrobić
  Codacy — którego dokumentacja potwierdza czytanie `.sqlfluff`, ale milczy o
  `.sqlfluffignore`. Uwaga: dziś wszystkie 19 plików `.sql` leży w `generated/`, więc po ignore
  SQLFluff nie lintuje **niczego** — config jest w całości na przyszłość,
  na pierwszy ręcznie pisany PostgreSQL.

  **Wyjaśnienie zagadki „dlaczego wykluczenia nie zadziałały"**: `.codacy.yml`
  miał klucz `semgrep`, a Codacy zmigrowało silnik na **Opengrep**. Stary klucz
  nie pasuje do żadnego silnika, więc **cała lista wykluczeń była martwa** — i
  dlatego „hardcoded password" trafiło w `e2e/**` i `**/*.test.ts` mimo wpisów.
  Klucz przemianowany na `opengrep` 2026-08-23.

  **Świadoma decyzja przy tej okazji**: Opengrep **nie** wyklucza już
  testów/e2e/scripts. Jest też skanerem sekretów, a zacommitowany credential
  jest credentialem niezależnie od katalogu — fixture'y testowe i skrypty CI to
  właśnie miejsca, gdzie prawdziwe bywają zostawiane. Wykluczone tylko
  generated/vendor/build. Findingi na celowych fixture'ach zamykamy pojedynczo
  w UI, nie oślepiając skanera na całe katalogi. Bez `.semgrep.yaml` — używamy
  domyślnych patternów Codacy.

- **Faza 2 zaczyna się od zera gałęziowo.** Nowa gałąź od świeżego `main` (po
  merge'u #74), nowy PR. Nazwa gałęzi: ta, którą wyznaczy nowa sesja.
- Czekamy na kolejne ponumerowane findingi — użytkownik podaje je pojedynczo.
  Jest ich **jeszcze mniej więcej tyle samo, co dotąd**.
- Triage `PE-01 … PE-24` należy do użytkownika i nie ma terminu.
