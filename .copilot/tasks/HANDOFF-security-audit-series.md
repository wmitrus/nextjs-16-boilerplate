# Handoff — Security Audit Remediation Series

**Ten plik jest handoffem i routerem pamięci tej serii. Przeczytaj go w całości.**
Właściciel repo: `wmitrus`, pisze po polsku — odpowiadaj po polsku.

Nie preloaduj całego `AGENTS.md`, `SECURITY_CODING_PATTERNS.md`,
`POSSIBLE_ENHANCEMENTS.md`, wcześniejszych `plan.md` ani `docs/features/*`.

Po tym handoffie stosuj aktywne root instructions i najwęższy właściwy
skill/workflow. Ładuj tylko odpowiednie sekcje `AGENTS.md` oraz wskazane tutaj
artefakty, gdy bieżący case rzeczywiście ich wymaga.

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
2. sekcji `Stan` — dopisz nowy case w pełnym opisie, poprzedni skróć do
   wpisu indeksowego, zachowaj maksymalnie dwa takie skrócone wpisy;
3. sekcji `Otwarte` — stan gałęzi/PR, co czeka na użytkownika.

**Reguła przycinania `Stan`**:

- trzymaj pełny opis tylko **ostatniego case'a**;
- dwa wcześniejsze trzymaj jako krótki wpis: `SEC-XX`, case/PR, wynik i ewentualne `PE-XX`;
- starsze pozostają wyłącznie w liczniku i źródłach prawdy.

Pełne szczegóły żyją w `SECURITY_CODING_PATTERNS.md` i per-case `.copilot/tasks/*/plan.md`. Ładuj je tylko wtedy, gdy nowy case faktycznie zahacza o wcześniejszą decyzję lub wzorzec.

Nowa sesja: przeczytaj ten handoff i **nie proś użytkownika o streszczenie**.
Następnie zastosuj aktywne root instructions, właściwy skill/workflow i dobierz tylko potrzebne sekcje `AGENTS.md` oraz wskazane artefakty.

## Start nowej sesji — przeczytaj najpierw

To jest **kontynuacja**, nie nowy projekt.

| Co                    | Wartość                                                                                                                                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faza 1                | PR #74, **zmergowany**, gałąź `claude/security-audit-multi-tenant-idor-e1y3yr`                                                                                                                                                                                                                                    |
| Faza 2                | **NOWA gałąź, NOWY PR** — nie doklejaj do #74. Bieżąca: gałąź `claude/password-policy-audit-miz994`, **PR #75, otwarty**. Case 18 (SEC-48) doszedł do tego samego PR-a **na wyraźne polecenie użytkownika** ("robimy na obecnym PR i jego branchu") — to odstępstwo od reguły "case = nowy PR", nie zmiana reguły |
| Zamknięte             | 18 case'ów łącznie. Ostatni wzorzec w katalogu: **SEC-48** (numery SEC-XX tej serii nie są ciągłe — część case'ów rozszerzała istniejące wzorce)                                                                                                                                                                  |
| **Następny case**     | **Case 19**, wzorzec **SEC-49**                                                                                                                                                                                                                                                                                   |
| Numeracja użytkownika | liczy findingi po swojemu i **jego numery nie pokrywają się z moimi**; jego ostatni to `17.` = Case 18 = SEC-48. Nie wyprowadzaj wzoru. Ustal ostatni `## SEC-XX` przez targeted search/find w `SECURITY_CODING_PATTERNS.md` i dodaj 1; nie ładuj całego katalogu tylko po to, żeby ustalić następny numer.       |
| Zostało               | użytkownik mówi, że jest **jeszcze drugie tyle znalezisk** (stan z początku fazy 2)                                                                                                                                                                                                                               |
| Backlog               | `PE-01 … PE-29`, **żaden nietriażowany** poza `PE-24` (zaakceptowany, zaplanowany osobno)                                                                                                                                                                                                                         |

Gdzie leży dowód dla każdego zamkniętego case'a:

To jest indeks źródeł, nie obowiązkowa lista preloadu.
Otwieraj tylko źródło potrzebne do bieżącego case'a:

- `docs/ai/general/SECURITY_CODING_PATTERNS.md` — SEC-01 … SEC-48, każdy z
  ryzykiem, regułą, egzekwowaniem i powiązaniami. **To jest źródło prawdy o
  tym, czego już nie wolno powtórzyć.**
- `.copilot/tasks/2026-08-2*/plan.md` — przyczyna, decyzje użytkownika,
  rozwiązanie i falsyfikacja testów, per case.
- `docs/features/` — dokumentacja docelowa feature'ów (12, 13, 14, 20, 32, 33,
  34, 35, 37, ENV-requirements).
- `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` — PE-01 … PE-29.

## Jak pracujemy (standing instructions — nie negocjowalne)

1. Użytkownik podaje ponumerowane findingi z audytu, jeden na raz. Każdy = jeden case.
2. Protokół repo: aktywne root instructions → najwęższy właściwy `.claude/skills/*/SKILL.md` → live code/config → tylko potrzebne sekcje `AGENTS.md` i dokumentacji. `src/proxy.ts` to middleware, nie `middleware.ts`.
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
utrzymywany**. Stan: `PE-01` … `PE-29`. `PE-24` jest zaakceptowany co do
zasady (zaplanowany po fazie 1, osobny mały PR). Reszta czeka na przegląd
użytkownika.

Obowiązek przy każdym case'ie:

- Wypłynął pomysł wartościowy, ale poza zakresem bieżącego case'a? Nowy wpis z
  kolejnym `PE-XX`, a w artefaktach taska tylko odwołanie po ID. Rationale
  zapisujemy **raz**, w PE.
- **Nigdy** nie implementuj wpisu z własnej inicjatywy. Nietriażowane ≠ zgoda.
- Gdy użytkownik striażuje wpis: zaktualizuj `Status` + krótka nota
  rozstrzygająca, wpisu **nie kasuj** — backlog jest też dziennikiem decyzji.

Reguła autorytatywna: `AGENTS.md`, sekcja `Possible Enhancements Backlog`.

Nie ładuj backlogu przy starcie case'a. Otwórz `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` tylko wtedy, gdy bieżący case faktycznie tworzy, odwołuje się do albo triażuje wpis `PE-XX`.

Aktualny zakres backlogu: **PE-01 … PE-29**.
`PE-24` jest zaakceptowany i zaplanowany osobno; pozostałe wpisy czekają na
triage użytkownika.

Nie preloaduj opisów PE. Gdy bieżący case tworzy albo dotyka konkretnego
ulepszenia, otwórz właściwy wpis w `POSSIBLE_ENHANCEMENTS.md` po jego ID.

## Stan

18 case'ów zamkniętych łącznie.

Poniżej ostatni case w pełnym opisie oraz maksymalnie dwa wcześniejsze jako
krótkie wpisy indeksowe. Starsze mają kompletny wzorzec w
`SECURITY_CODING_PATTERNS.md` i własny `plan.md`.

- **SEC-48** (Case 18, faza 2, PR #75) — MFA + step-up dla mutacji admina:
  MFA enrollment dla admina, MFA przy AuthJS loginie oraz świeży step-up proof
  dla wszystkich admin mutations. Implementacja jest deny-by-default i obejmuje
  oba providery; klucz bazuje na `APP_SECURITY_MASTER_KEY`.
  Powiązany backlog: **PE-26 … PE-29**.

  Pełne decyzje dotyczące TOTP, recovery codes, HKDF, session binding, replay
  protection, TTL, Clerk/AuthJS oraz guardów są w `SECURITY_CODING_PATTERNS.md`
  (`SEC-48`) i per-case `plan.md`. Ładuj je tylko gdy nowy case dotyka tych
  mechanizmów.

## Pułapki, które już mnie kosztowały

Sprawdzaj tylko pułapki pasujące do bieżącego case'a:

- **Nowa migracja** → dodaj ją do allowlisty `readMigrationSql()` w tym samym
  commicie; inaczej Preview może paść mimo zielonych lokalnych bramek.
- **Fixture z sekretem** → nie używaj wartości przypominających prawdziwe
  klucze (`sk_live_*` itp.); GitHub push protection może je zablokować.
- **`vi.mock` + `vi.resetAllMocks()`** → dla konstruktorów preferuj `class {}`
  zamiast fabryki opartej o `vi.fn().mockImplementation(...)`.
- **Test regresyjny** → zielony wynik nie wystarcza; potwierdź, że test
  faktycznie obserwuje naprawianą ścieżkę i jest falsyfikowalny.
- **Dynamiczny dispatch** → przy lokalnym `security/detect-object-injection`
  preferuj `Map#get()` zamiast `Record` + `obj[key]`.
- **`declare const enum` z dependency + `isolatedModules`** → sprawdź aktualne
  wartości w `node_modules/<pkg>/index.d.ts`; nie zgaduj ich z pamięci.
- **Generyczny czerwony status `Vercel` obok zielonego orchestrated Preview** →
  sprawdź konflikt deploymentów; repo ma `vercel.json` z
  `git.deploymentEnabled: false`.
- **Walidacja** → używaj dokładnych bramek aktywnego workflow/skill; nie
  uruchamiaj pełnego zestawu tylko dlatego, że istnieje.
- Gdy użytkownik prostuje fakt techniczny, zweryfikuj go w aktualnym źródle
  zamiast bronić wcześniejszego założenia.

## Otwarte

- **PR #75 (faza 2): otwarty, zawiera teraz DWA case'y** — 17 (SEC-47,
  password policy) i 18 (SEC-48, MFA + step-up). Case 18 trafił tutaj na
  wyraźne polecenie użytkownika, wbrew domyślnej regule "case = nowy PR".
- **Do zrobienia PRZED merge, po stronie użytkownika:**
  1. **Vercel — nowa zmienna wymagana**: `APP_SECURITY_MASTER_KEY`
     (`openssl rand -base64 48`), **osobno dla Production i Preview**, nigdy
     "All Environments". Bez niej walidacja env **wywali build** (SEC-48).
     `APP_SECURITY_MASTER_KEY_PREVIOUS` i `ADMIN_STEP_UP_MODE` zostawić
     nieustawione.
  2. **E2E step-upu jest obowiązkowym CI checkiem**:
     `.github/workflows/e2e-admin-step-up.yml`, bez labelki i `paths:`,
     z `E2E_REQUIRE_STEP_UP_SUITE=true`.

  AuthJS E2E infrastructure została poprawiona tak, aby nie wymagała fixture'ów
  Clerka dla scenariuszy AuthJS. Suite step-upu wykonał się realnie i jest
  zielony: `4 passed` na `55ebcd3`.

  Szczegóły wcześniejszych awarii infrastruktury E2E i ich napraw są w
  per-case `plan.md`; nie ładuj ich bez potrzeby.

  Do rozważenia przez użytkownika: dodać ten job do required checks. 3. Reszta admin-owych E2E jedzie dalej na kontrolowanym bypassie
  (`ADMIN_STEP_UP_MODE=bypass-local-only` ustawia `run-scenario.mjs`) — ich
  tematem nie jest step-up.

- **Codacy: triage zakończony, progi zamrożone**:
  Function Length 120, Cyclomatic Complexity 15, Parameter Count 10,
  File Length 500. Nie podnoś ich dalej.

  Jeden finding TOTP `hardcoded password` jest świadomie zaakceptowany jako
  fixture testowy. Szczegóły decyzji i wykonanych refactorów są w per-case
  `plan.md`; nie ładuj ich bez potrzeby.

  Skanery/progi nadal podlegają standing instruction powyżej:
  raportuj stan i czekaj na decyzję użytkownika zamiast samodzielnie
  rozszerzać analizę.

- **Migracja `0019_rare_outlaw_kid`** (tabele `user_mfa_totp`,
  `user_mfa_recovery_codes`) jest w `readMigrationSql()` w tym samym commicie
  — pułapka z pięciu case'ów fazy 1 nie powtórzona.
- `vercel.json` (`git.deploymentEnabled: false`) dodany na gałęzi PR #75 —
  po zmergowaniu do `main` obowiązuje globalnie, nowe gałęzie dziedziczą.
- Czekamy na kolejne ponumerowane findingi — użytkownik podaje je pojedynczo.
- Triage `PE-01 … PE-29` należy do użytkownika i nie ma terminu.
