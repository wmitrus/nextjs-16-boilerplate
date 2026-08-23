# Handoff — Security Audit Remediation Series

**Read this first, then `AGENTS.md`.** Branch: `claude/security-audit-multi-tenant-idor-e1y3yr` (PR #74). Owner: `wmitrus`, pisze po polsku.

## Jak pracujemy (standing instructions — nie negocjowalne)

1. Użytkownik podaje ponumerowane findingi z audytu, jeden na raz. Każdy = jeden case.
2. Protokół repo: `AGENTS.md` → odpowiedni `.claude/skills/*/SKILL.md` przez `Skill`. `src/proxy.ts` to middleware, nie `middleware.ts`.
3. **Testy regresyjne obowiązkowe** i muszą być **sfalsyfikowane** — celowo zepsuj kod, potwierdź że test pada, dopiero wtedy jest wart czegokolwiek.
4. **W każdym punkcie decyzyjnym: wyjaśnij i zapytaj** (`AskUserQuestion`). Decyzje produktowe/vendorowe/progowe/architektoniczne nie są moje.
5. **Kolejność pushu:** praca gotowa → wszystkie bramki zielone → **napisz użytkownikowi jakie zmienne ustawić na Vercelu** → **czekaj na potwierdzenie** → dopiero push. Naruszyłem to raz; użytkownik powtórzył dosłownie: _"najpierw masz mi napisać zmienne, push dopiero jak je ustawie"_.
6. **PR merguje wyłącznie użytkownik.**
7. Dokumentuj **rozwiązanie każdego taska oraz jego powód i przyczynę** — w `.copilot/tasks/*/plan.md`, jako wzorzec `SEC-XX` w `docs/ai/general/SECURITY_CODING_PATTERNS.md`, **oraz w docelowej dokumentacji feature'a w `docs/features/`**. Ten ostatni punkt był przez pół serii pomijany — nie powtarzać.
8. Odroczone-ale-wartościowe pomysły → `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` jako PE-XX, odwołuj się po ID. Szczegóły niżej.

## POSSIBLE_ENHANCEMENTS.md — plik żyje, trzeba go dalej updatować

`docs/ai/general/POSSIBLE_ENHANCEMENTS.md` jest w repo i **jest aktywnie
utrzymywany**. Stan: `PE-01` … `PE-21`, **żaden nie striażowany** — użytkownik
przejrzy backlog na koniec serii.

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

Ostatnie wpisy z tej serii: PE-14 (nullable `waitlist_entries.organization_id`),
PE-15 (konstruktorowe mocki `vi.fn().mockImplementation()`), PE-16 (strict rate
limiting w Edge middleware), PE-17 (globalny purge `rate_limit_counters`),
PE-18 (durable backing dla login account bucket), PE-19 (weryfikacja
precedencji nagłówków Vercela), PE-20 (zakotwiczenie `trusted-proxy` na socket
peerze), PE-21 (HMAC + replay window i service identity dla internal API).

## Stan

14 case'ów zamkniętych (SEC-37…SEC-44). HEAD `a0f7608` wypchnięty. Ostatni commit to aktualizacja `docs/features/` dla całej serii.

Ostatnie trzy case'y:

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

- CI na PR #74 (head `a0f7608`) — zaplanowany check-in. Kluczowe: Deploy Preview, DB Integration Tests, Secret Scanning.
- Czekamy na kolejne ponumerowane case'y.
- Na koniec serii: użytkownik przegląda cały PR i triażuje PE-01…PE-21.
