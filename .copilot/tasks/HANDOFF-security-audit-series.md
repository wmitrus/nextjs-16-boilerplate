# Handoff — Security Audit Remediation Series

**Ten plik jest pamięcią serii. Przeczytaj go w całości, potem `AGENTS.md`.**
Właściciel repo: `wmitrus`, pisze po polsku — odpowiadaj po polsku.

## Model sesji: nowy czat na każdy case, NIE `/compact`

**Decyzja użytkownika, 2026-08-24.** Ten plik + `SECURITY_CODING_PATTERNS.md` +
`POSSIBLE_ENHANCEMENTS.md` + per-case `.copilot/tasks/*/plan.md` +
`docs/features/*` są zaprojektowane jako **pełna, bezstratna pamięć na dysku**.
`/compact` to stratna kompresja — gubi dokładne sformułowania decyzji,
konkretne wartości progów, treść falsyfikacji testów. Skoro i tak wszystko
istotne musi trafić do plików, żeby przetrwać do następnego case'a, trzymanie
rosnącej historii czatu w kontekście tylko zjada usage bez realnej korzyści.

**Zasada**: każdy case = nowy czat. Nigdy `/compact` w tej serii.

**Obowiązek na koniec KAŻDEGO case'a (nie tylko fazy)** — sesja nie jest
skończona, dopóki nie zaktualizujesz w tym pliku:

1. tabeli na górze (`Następny case` / wzorzec `SEC-XX`, stan `Backlog`),
2. sekcji `Stan` — dopisz nowy case w pełnym opisie, **a najstarszy z
   trzymanych tu trzech zwiń** (patrz reguła niżej),
3. sekcji `Otwarte` — stan gałęzi/PR, co czeka na użytkownika.

**Reguła przycinania `Stan`**: trzymaj tu w pełnym opisie **tylko ostatnie 3
case'y**. Starsze nie znikają z projektu — żyją w `SECURITY_CODING_PATTERNS.md`
(pełny wzorzec `SEC-XX`) i we własnym `.copilot/tasks/*/plan.md` (przyczyna,
decyzje, falsyfikacja) — tu zostaje po nich tylko wpis w liczniku. Bez tego
plik rośnie bez końca i każda nowa sesja płaci za czytanie całej historii.

Nowa sesja: przeczytaj ten plik + `AGENTS.md` i **nie proś użytkownika o
streszczenie** — wszystko potrzebne jest tutaj albo pod wskazanymi ścieżkami.

## Start nowej sesji — przeczytaj najpierw

To jest **kontynuacja**, nie nowy projekt.

| Co                    | Wartość                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faza 1                | PR #74, **zmergowany**, gałąź `claude/security-audit-multi-tenant-idor-e1y3yr`                                                                                                          |
| Faza 2                | **NOWA gałąź, NOWY PR** — nie doklejaj do #74. Bieżąca: gałąź `claude/password-policy-audit-miz994`, **PR #75, otwarty, wszystkie checki zielone**, czeka na merge przez użytkownika    |
| Zamknięte             | 17 case'ów łącznie. Ostatni wzorzec w katalogu: **SEC-47** (numery SEC-XX tej serii nie są ciągłe — część case'ów rozszerzała istniejące wzorce)                                        |
| **Następny case**     | **Case 18**, wzorzec **SEC-48**                                                                                                                                                         |
| Numeracja użytkownika | liczy findingi po swojemu i **jego numery nie pokrywają się z moimi**; jego ostatni to `16.` = Case 17 = SEC-47. Nie wyprowadzaj wzoru — weź **ostatni `## SEC-` z katalogu i dodaj 1** |
| Zostało               | użytkownik mówi, że jest **jeszcze drugie tyle znalezisk** (stan z początku fazy 2)                                                                                                     |
| Backlog               | `PE-01 … PE-25`, **żaden nietriażowany** poza `PE-24` (zaakceptowany, zaplanowany osobno)                                                                                               |

Gdzie leży dowód dla każdego zamkniętego case'a:

- `docs/ai/general/SECURITY_CODING_PATTERNS.md` — SEC-01 … SEC-47, każdy z
  ryzykiem, regułą, egzekwowaniem i powiązaniami. **To jest źródło prawdy o
  tym, czego już nie wolno powtórzyć.**
- `.copilot/tasks/2026-08-2*/plan.md` — przyczyna, decyzje użytkownika,
  rozwiązanie i falsyfikacja testów, per case.
- `docs/features/` — dokumentacja docelowa feature'ów (12, 13, 14, 20, 32, 33,
  34, 35, ENV-requirements).
- `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` — PE-01 … PE-25.

## Jak pracujemy (standing instructions — nie negocjowalne)

1. Użytkownik podaje ponumerowane findingi z audytu, jeden na raz. Każdy = jeden case.
2. Protokół repo: `AGENTS.md` → odpowiedni `.claude/skills/*/SKILL.md` przez `Skill`. `src/proxy.ts` to middleware, nie `middleware.ts`.
3. **Testy regresyjne obowiązkowe** i muszą być **sfalsyfikowane** — celowo zepsuj kod, potwierdź że test pada, dopiero wtedy jest wart czegokolwiek.
4. **W każdym punkcie decyzyjnym: wyjaśnij i zapytaj** (`AskUserQuestion`). Decyzje produktowe/vendorowe/progowe/architektoniczne nie są moje.
5. **Kolejność pushu:** praca gotowa → wszystkie bramki zielone → **napisz użytkownikowi jakie zmienne ustawić na Vercelu** → **czekaj na potwierdzenie** → dopiero push. Jeśli nie ma nowych zmiennych, napisz to wprost i mimo to czekaj na potwierdzenie przed pierwszym pushem case'a. Naruszyłem to raz; użytkownik powtórzył dosłownie: _"najpierw masz mi napisać zmienne, push dopiero jak je ustawie"_.
6. **PR merguje wyłącznie użytkownik.** Nigdy ja — ani przyciskiem, ani
   `merge_pull_request`.
7. Dokumentuj **rozwiązanie każdego taska oraz jego powód i przyczynę** — w `.copilot/tasks/*/plan.md`, jako wzorzec `SEC-XX` w `docs/ai/general/SECURITY_CODING_PATTERNS.md`, **oraz w docelowej dokumentacji feature'a w `docs/features/`**. Ten ostatni punkt był przez pół serii pomijany — nie powtarzać.
8. Odroczone-ale-wartościowe pomysły → `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` jako PE-XX, odwołuj się po ID. Szczegóły niżej.
9. **Skanery i progi CI (Codacy i podobne): raportuj, nie drąż.** Moim
   zadaniem jest **zakomunikować, że coś jest, i czekać na decyzję użytkownika**.
   Nie wolno mi z własnej inicjatywy pobierać findingów, kalibrować progów,
   instalować narzędzi ani odtwarzać analizy lokalnie — to spalanie usage
   użytkownika. Dosłownie: _"przestań sam marnować moje usage na codacy, ty masz
   mi tylko zakomunikować że jest i czekać na moje info, nigdy więcej tego nie
   rób"_. Bez criticali nie ruszamy tematu w ogóle. Wyjątek: nie ma wyjątku —
   nawet „szybkie sprawdzenie" jest naruszeniem. **To NIE dotyczy botów
   review'ujących kod** (np. `chatgpt-codex-connector` / Codex) — ich findingi
   to zwykłe bug-reporty na konkretne linie kodu, nie kalibrowanie progów;
   weryfikuj i napraw małe/pewne od razu (patrz PR #75, trzy findingi Codexa,
   wszystkie naprawione bez pytania), tylko duże/niejednoznaczne zostawiaj
   użytkownikowi.

## POSSIBLE_ENHANCEMENTS.md — plik żyje, trzeba go dalej updatować

`docs/ai/general/POSSIBLE_ENHANCEMENTS.md` jest w repo i **jest aktywnie
utrzymywany**. Stan: `PE-01` … `PE-25`. `PE-24` jest zaakceptowany co do
zasady (zaplanowany po fazie 1, osobny mały PR). Reszta czeka na przegląd
użytkownika.

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

Ostatni wpis: **PE-25** — breached/common-password blocklist check (HIBP
k-anonymity albo lokalny korpus), odłożony przy SEC-47 jako nowa granica
zaufania na ruch wychodzący / decyzja vendorowa. Starsze wpisy (PE-01…PE-24):
pełne rationale w samym pliku, nie duplikowane tutaj.

## Stan

17 case'ów zamkniętych łącznie. Poniżej **tylko ostatnie trzy** w pełnym
opisie (reguła przycinania — patrz "Model sesji" na górze); starsze mają
kompletny wzorzec w `SECURITY_CODING_PATTERNS.md` i własny `plan.md`.

- **SEC-47** (Case 17, faza 2, PR #75) — password policy: Argon2id domyślny
  dla nowych/zmienianych credentials (`@node-rs/argon2`, parametry jawne w
  kodzie: memoryCost=19456, timeCost=2, parallelism=1, outputLen=32), bcrypt
  **tylko** jako read-only compat path (format rozpoznawany po
  self-describing prefiksie hasha, dispatch przez `Map#get()` — nie
  `Record`+bracket, bo lokalny `security/detect-object-injection` i tak to
  złapie niezależnie od zawężenia typu klucza; SEC-01 wzorzec). Polityka
  długości: 15–128 code points (NIST SP 800-63B-4 single-factor floor, nie
  8-znakowy próg dla 2FA), NFC-normalizacja, bez reguł kompozycji.
  Rehash-on-login: udane logowanie na starym bcrypcie → best-effort upgrade
  do Argon2id, **compare-and-set** (WHERE dopina też stary `hashedPassword`,
  żeby wyścig z równoległym resetem hasła nie nadpisał świeżego hasha
  starym) — to była poprawka po recenzji Codexa (P1). Wyjątek bez
  auto-migracji: kandydat, który bcrypt by uciął (>72 bajtów UTF-8) — zostaje
  na bcrypcie, wymaga realnego resetu. `needsRehash` dla Argon2 dekoduje
  też długość digestu, nie tylko nagłówek `v=/m=/t=/p=` (druga poprawka po
  Codexie, P2) — sam nagłówek nie odróżnia hasha o innym `outputLen`.
  Zero migracji DB (`hashed_password` już `text`, oba formaty
  self-describing). Bez DB migration guardu (`readMigrationSql()`) — nie
  dotyczy.
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

Guardy statyczne (chodzą po `src/`, wywalają build): SEC-23 uuid-route-param,
SEC-38 response-service, SEC-41 platform-admin, SEC-42 strict-rate-limit,
SEC-43 client-ip. SEC-47 nie dodał nowego guardu (nie ma wzorca do złapania
statycznie — logika jest w jednym module, nie rozproszona).

## Pułapki, które już mnie kosztowały

- **`readMigrationSql()`** w skrypcie migracji to allowlist literalnych ścieżek (SEC-05/SEC-12). Nowa migracja **musi** trafić tam w tym samym commicie — inaczej Deploy Preview pada, a wszystkie lokalne bramki są zielone. Zdarzyło się: pięć case'ów z czerwonym preview.
- **Push protection GitHuba** blokuje realistycznie wyglądające sekrety w fixture'ach (`sk_live_...`). Używaj wartości bez kształtu prawdziwego klucza.
- **`vi.fn().mockImplementation(() => ({}))` w fabryce `vi.mock`** — fabryka odpala się po `vi.resetAllMocks()`, więc `new X()` rzuca. Używaj `class {}`.
- **Zielony test to nie dowód** — sprawdź, że mock faktycznie był wołany. Jeden test przechodził bo prawdziwy fallback zwracał tę samą wartość co asercja. Przykład z SEC-47: test "skip rehash for truncated" przechodził nawet po wycięciu gałęzi kodu, bo bez asercji na konkretny log WARN wynik wyglądał tak samo jak "nie trzeba rehashu" — dopiero dodanie asercji na `mockLoggerWarn` uczyniło test falsyfikowalnym.
- **`security/detect-object-injection` + lokalny `no-restricted-syntax` łapią `obj[key]()` niezależnie od tego, jak wąski jest typ `key`** — nawet jawny `Record<TwoMemberUnion, fn>` dostaje warning. Użyj `Map<Key, fn>` + `.get()` (SEC-01 wzorzec) zamiast `Record` + bracket, jeśli dispatch ma być naprawdę czysty lintersko.
- **`declare const enum` z pakietu npm + `isolatedModules: true`** → `TS2748` przy każdym cross-module referencie (np. `Algorithm.Argon2id` z `@node-rs/argon2`). Fix: liczby wprost z `.d.ts` pakietu, z komentarzem skąd i dlaczego (nie z pamięci — sprawdź w `node_modules/<pkg>/index.d.ts` za każdym razem, bo wartości są specyficzne dla pakietu).
- **Redundantny auto-deploy Vercela vs własny orchestrated workflow** — jeśli PR pokazuje czerwony generyczny status `Vercel` OBOK zielonego `Deploy Preview`/`Verify Preview Runtime` (nasz `preview-deploy.yml`), to prawie na pewno wyścig dwóch niezależnych deploymentów, nie wina diffu z tego case'a. **Naprawione trwale 2026-08-24**: `vercel.json` z `git.deploymentEnabled: false` w rootcie repo — jak wyląduje na `main`, każda przyszła gałąź to dziedziczy, nie trzeba tego powtarzać per case.
- Bramki: `pnpm typecheck`, `pnpm lint --fix` (**zawsze `--fix`**), `pnpm test`, `pnpm test:db`, `pnpm skott:check:only`, `pnpm depcheck`, `pnpm env:check`. Vitest: `--config vitest.unit.config.ts`.
- Użytkownik **prostuje mnie merytorycznie i zwykle ma rację** (feature flagi z `provider=db` są runtime-togglable; RFC 7239 standaryzuje `Forwarded`, nie algorytm dla XFF). Nie broń się — sprawdź i popraw.

## Otwarte

- **PR #75 (faza 2, case 17/SEC-47): otwarty, wszystkie checki zielone
  (`mergeable_state: clean`), 3 wątki review od Codexa naprawione i
  rozwiązane, czeka na merge przez użytkownika.** Subskrypcja PR aktywna w
  ostatniej sesji — nowa sesja powinna sama zasubskrybować ponownie
  (`subscribe_pr_activity`) jeśli ma dalej babysitować ten PR.
- `vercel.json` (`git.deploymentEnabled: false`) dodany na gałęzi PR #75 —
  po zmergowaniu do `main` obowiązuje globalnie, nowe gałęzie dziedziczą.
- Czekamy na kolejne ponumerowane findingi — użytkownik podaje je pojedynczo.
  Stan na początek fazy 2: **jeszcze mniej więcej tyle samo, co dotąd**
  (aktualna liczba pozostałych nieznana tej sesji).
- Triage `PE-01 … PE-25` należy do użytkownika i nie ma terminu.
