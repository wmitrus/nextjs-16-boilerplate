# Produkcyjne warianty naprawy Vercel Prebuilt Deploy

## Status dokumentu

Ten dokument opisuje wyłącznie rozwiązania nadające się do środowiska
produkcyjnego. Nie jest implementacją.

**Decyzja z 2026-08-01:** dla tego repozytorium wybrany został **wariant A -
Prebuilt zgodny z kontraktem Vercela**. Wariant A pozostawia New Relic,
zachowuje model `vercel build --prod` + `vercel deploy --prebuilt --prod`,
usuwa prototypowe obejścia i wprowadza fail-closed guardy oparte na
`Object.values(filePathMap)`.

## Kontekst decyzyjny

Vercel CLI `58.4.4` zaczął ponownie stosować reguły użytkownika z
`.vercelignore` do ścieżek źródłowych zapisanych w `filePathMap`. Repozytorium
ignoruje `node_modules`, dlatego CLI pomija wymagane pliki pnpm, pozostawiając
jednocześnie `.vc-config.json`, który nadal je referencjonuje.

W kontrakcie Build Output API:

- klucz `filePathMap` jest ścieżką docelową wewnątrz funkcji;
- wartość `filePathMap` jest ścieżką źródłową, którą Vercel CLI dodaje do
  uploadu;
- w aktualnym artefakcie klucze i wartości są zwykle identyczne, ale nie jest
  to gwarancja kontraktu;
- walidacja lokalnego pliku i pokrycia uploadu musi operować na
  `Object.values(filePathMap)`, nie na kluczach.

## Kryteria rozwiązania produkcyjnego

Każdy zaakceptowany wariant musi zapewniać:

1. Spójność: każda źródłowa wartość `filePathMap` jest obecna w uploadzie.
2. Poufność: sekrety, pliki środowiskowe i logi nie mogą zostać dodane do
   deploymentu przez wygenerowany artifact.
3. Determinizm: wersja Vercel CLI jest przypięta i pochodzi z lockfile.
4. Fail closed: niespójny lub podejrzany artifact zatrzymuje CI przed realnym
   deployem.
5. Brak drugiego builda: walidacja wykorzystuje istniejący `.vercel/output`.
6. Kontrolowany koszt: rozmiar i liczba plików uploadu są raportowane oraz mają
   ustalony budżet regresji.
7. Utrzymywalność: rozwiązanie nie zależy od ręcznej listy aktualnych
   zależności aplikacji.

## Obowiązkowa baza dla wszystkich wariantów

Niezależnie od wybranego modelu należy:

- dodać Vercel CLI jako dokładnie przypiętą zależność narzędziową i uruchamiać
  ją przez `pnpm exec vercel` albo równoważny skrypt repozytorium;
- aktualizować CLI wyłącznie przez kontrolowany PR z buildem, sprawdzeniem
  upload manifestu i deploymentem testowym;
- walidować źródłowe wartości `filePathMap`, ich istnienie, pozostawanie
  wewnątrz repozytorium oraz brak ucieczki przez symlink;
- blokować artifact referencjonujący `/.env*`, logi lub inne sklasyfikowane
  dane wrażliwe;
- nie modyfikować automatycznie `.vc-config.json` przez usuwanie wpisów;
  usunięcie trace może stworzyć funkcję, która wdroży się poprawnie, ale ulegnie
  awarii dopiero w runtime;
- przed realnym deployem porównać wymagane źródła z manifestem dry-run dla
  przypiętej wersji CLI;
- przechowywać wynik walidacji i metryki uploadu jako artifact CI bez sekretów.

## Wariant A - Prebuilt zgodny z kontraktem Vercela

### Zakres

Zachować lokalne `vercel build --prod` i `vercel deploy --prebuilt --prod`, ale
usunąć z użytkownikowego `.vercelignore` reguły dla katalogów, z których builder
legalnie tworzy `filePathMap`, przede wszystkim `.next` i `node_modules`.

W trybie prebuilt główne skanowanie CLI nadal ogranicza się do
`.vercel/output`. Pliki spoza tego katalogu są dodawane selektywnie na podstawie
`filePathMap`. Brak użytkownikowej reguły `node_modules` nie oznacza więc
automatycznie uploadu całego katalogu zależności.

Reguły chroniące prawdziwie wrażliwe lub zbędne dane mogą pozostać, ale guard
musi zatrzymać build, jeżeli builder kiedykolwiek zacznie referencjonować jedną
z tych ścieżek.

### Zalety

- najmniejsza zmiana względem obecnego pipeline'u;
- zachowuje jeden build i istniejącą kolejność migracji;
- wykorzystuje oficjalny mechanizm Vercel zamiast odtwarzać uploader;
- automatycznie obsługuje zmiany zależności i układu pnpm;
- nie wymaga statycznej listy pakietów ani manifestów Next.js;
- niski koszt CI i niski koszt utrzymania.

### Ryzyka i zabezpieczenia

- zachowanie uploadu może zmienić się przy aktualizacji CLI, dlatego pin i
  test kontraktu są obowiązkowe;
- dry-run JSON należy traktować jako kontrakt konkretnej przypiętej wersji CLI,
  a parser musi mieć test odrzucający nieznany format;
- należy raportować wzrost rozmiaru uploadu i wymagać akceptacji po przekroczeniu
  ustalonego progu.

### Ocena dla boilerplate

**Rekomendowany wariant.** Jest zgodny z aktualną architekturą wdrożenia, nie
zwiększa liczby buildów i nie koduje wiedzy o konkretnych zależnościach. Dla
boilerplate ważniejsze jest zachowanie kontraktu narzędzia niż utrzymywanie
rosnącej listy wyjątków dla każdej wersji Next.js, pnpm i observability SDK.

## Wariant B - Standardowy zdalny build Vercela

### Zakres

Zrezygnować z `--prebuilt` i wysyłać źródła do kontrolowanego builda na
Vercelu. Platforma instaluje zależności i buduje funkcje w jednym środowisku,
więc nie występuje granica pomiędzy lokalnym `filePathMap` a osobnym uploadem
plików źródłowych.

Lokalny `vercel build` powinien wtedy zostać usunięty z pipeline'u, aby nie
wykonywać dwóch pełnych buildów. Migracje oraz walidacja env pozostają osobnymi,
jawnie kontrolowanymi krokami.

### Zalety

- najbardziej standardowa i najmniej niestandardowa ścieżka Vercela;
- usuwa całą klasę błędów split build/upload;
- mniejsza ilość własnego kodu walidującego;
- bardzo niski koszt utrzymania dla typowego użytkownika boilerplate.

### Ryzyka i zabezpieczenia

- mniejsza kontrola nad środowiskiem builda i jego zmianami po stronie Vercela;
- trudniej udowodnić dokładny artifact przed produkcyjnym buildem;
- wymaga ponownego zaprojektowania kolejności migracji, promocji i rollbacku;
- zwiększa zależność od Vercela i zmniejsza przenośność pipeline'u.

### Ocena dla boilerplate

**Najlepszy wariant uproszczenia platformowego**, jeżeli projekt nie potrzebuje
lokalnego prebuilt artifactu. Nie jest rekomendowany jako szybka naprawa tego
incydentu, ponieważ zmienia model wdrożenia i ma większy blast radius niż
wariant A.

## Wariant C - Hermetyczny katalog stagingowy z allowlistą

### Zakres

Po buildzie utworzyć izolowany katalog deploymentu zawierający wyłącznie:

- `.vercel/output`;
- wszystkie unikalne źródłowe wartości `filePathMap` skopiowane z zachowaniem
  ścieżek;
- minimalne metadane projektu wymagane przez Vercel CLI.

Pipeline generuje manifest ścieżek i hashy, sprawdza containment oraz symlinki,
a następnie uruchamia prebuilt deploy z katalogu stagingowego. Żaden inny plik
repozytorium nie jest dostępny uploaderowi.

### Zalety

- najmniejszy możliwy zakres danych dostępnych dla uploadu;
- jednoznaczny, audytowalny manifest deploymentu;
- silna izolacja sekretów i plików roboczych;
- możliwość kryptograficznego potwierdzenia artifactu między jobami.

### Ryzyka i zabezpieczenia

- rozwiązanie częściowo odtwarza logikę Vercel CLI i może driftować względem
  Build Output API;
- trzeba poprawnie obsłużyć prawa plików, symlinki, duplikaty, path traversal i
  zmiany schematu;
- wymaga testów kontraktowych przy każdej aktualizacji Next.js i Vercel CLI;
- większy koszt utrzymania i dłuższy pipeline.

### Ocena dla boilerplate

**Wariant dla środowisk regulowanych lub wysokiego assurance.** Technicznie
produkcyjny, ale zbyt złożony jako domyślny mechanizm ogólnego boilerplate bez
konkretnego wymagania compliance.

## Wariant D - Niezależny artifact kontenerowy

### Zakres

Budować Next.js jako `standalone` i publikować niezmienny obraz OCI, a następnie
wdrażać go na platformie kontenerowej. Artifact zawiera dokładnie skopiowane
zależności runtime i nie korzysta z Vercel Build Output API.

### Zalety

- pełna kontrola nad buildem, runtime i promocją tego samego artifactu;
- wysoka przenośność między dostawcami;
- dojrzałe mechanizmy SBOM, podpisywania obrazów i skanowania zależności;
- brak zależności od semantyki `filePathMap` i `.vercelignore`.

### Ryzyka i zabezpieczenia

- największa zmiana architektury operacyjnej;
- utrata części funkcji zarządzanych przez Vercel lub konieczność ich
  odtworzenia;
- odpowiedzialność za skalowanie, routing, sekrety i obserwowalność runtime;
- wymaga osobnego projektu migracyjnego, testów wydajnościowych i runbooków.

### Ocena dla boilerplate

**Wariant strategiczny dla przenośności**, nie remediacja bieżącego incydentu.
Ma sens tylko wtedy, gdy boilerplate ma oficjalnie wspierać również hosting poza
Vercel.

## Porównanie

| Wariant                      | Poprawność | Poufność          | Koszt CI      | Utrzymanie   | Zmiana modelu | Rekomendacja               |
| ---------------------------- | ---------- | ----------------- | ------------- | ------------ | ------------- | -------------------------- |
| A. Contract-aligned prebuilt | wysoka     | wysoka z guardami | niski         | niski        | mała          | **domyślny wybór**         |
| B. Zdalny build Vercela      | wysoka     | wysoka            | średni        | bardzo niski | średnia       | dobre uproszczenie         |
| C. Hermetyczny staging       | wysoka     | bardzo wysoka     | średni        | wysoki       | średnia       | compliance/high assurance  |
| D. Artifact kontenerowy      | wysoka     | wysoka            | średni/wysoki | wysoki       | bardzo duża   | strategia wieloplatformowa |

## Rozwiązania odrzucone jako nieprodukcyjne

Następujące podejścia nie powinny być docelowym rozwiązaniem:

- pin do CLI sprzed poprawki bezpieczeństwa z 30 lipca 2026;
- pozostawienie `vercel@latest` w produkcyjnym workflow;
- ręczna allowlista aktualnych pakietów, takich jak `next`, `react`, `newrelic`
  lub `@opentelemetry/*`;
- szerokie `!node_modules/.pnpm/**` jako jedyne zabezpieczenie bez manifestu i
  budżetu uploadu;
- automatyczne usuwanie wpisów z wygenerowanego `filePathMap`;
- poleganie wyłącznie na sprawdzeniu, że plik istnieje lokalnie;
- poleganie na cache Vercela;
- usunięcie New Relic albo OpenTelemetry;
- zmiana pnpm na inny package manager bez dowodu kontraktowego;
- drugi pełny `vercel build` wykonywany tylko w celu walidacji.

## Status prototypu z wcześniejszych faz

Wcześniejsze prace z katalogu
`.copilot/tasks/2026-08-01-vercel-prebuilt-node-modules-deploy/` są traktowane
jako archived prototype, nie jako zatwierdzony plan produkcyjny.

Do ponownego użycia nadają się:

- parser dry-run JSON;
- porównanie wymaganych ścieżek z manifestem uploadu;
- idea fail-closed guardu;
- testy regresyjne opisujące brak pokrycia uploadu;
- metryki liczby plików i rozmiaru uploadu.

Do wycofania z docelowej ścieżki produkcyjnej:

- `vercel:prebuilt:sanitize`;
- automatyczne usuwanie wpisów z wygenerowanego `.vc-config.json`;
- ręczna allowlista pakietów w `.vercelignore`;
- broad `outputFileTracingExcludes` traktowane jako samodzielny workaround tego
  incydentu; wspierane route-level exclusions mogą pozostać jako higiena
  rozmiaru metadanych, ale nie obejmują Node proxy trace w Turbopack.

## Rekomendowana decyzja dla tego repozytorium

Wybrać **wariant A** z pełną obowiązkową bazą bezpieczeństwa:

1. Przypiąć audytowaną wersję Vercel CLI w `package.json` i lockfile.
2. Uprościć `.vercelignore`: nie filtrować użytkownikową regułą katalogów
   buildera `.next` i `node_modules`; zachować ochronę danych wrażliwych oraz
   niepotrzebnych katalogów repozytorium.
3. Poprawić validator tak, aby analizował `Object.values(filePathMap)` i
   odrzucał ucieczki poza root oraz przez symlink.
4. Nie sanitizować wygenerowanych configów; traktować forbidden metadata refs
   jako blokadę tylko wtedy, gdy trafią do planu uploadu.
5. Wymagać lokalnego guardu spójności oraz dry-run guardu, który potwierdza
   wszystkie dozwolone runtime refs i zero forbidden uploadów.
6. Egzekwować jawny budżet liczby plików i rozmiaru uploadu względem świeżej
   bazy odniesienia.
7. Wykonać deployment testowy, następnie realny production deploy i potwierdzić
   status funkcji oraz brak nieoczekiwanych plików w deployment tree.

Ten wariant najlepiej pasuje do boilerplate, ponieważ jest mały, zgodny z
oficjalnym przepływem Vercela, automatycznie przeżywa zmiany grafu zależności i
nie zamienia repozytorium w utrzymywaną ręcznie kopię logiki bundlera.

## Wymagany handoff

- Architecture Guard: potwierdzenie, że implementacja Variant A nie zmienia
  architektury deployu poza kontraktem Vercel prebuilt.
- Security & Auth: zatwierdzenie polityki forbidden traces, symlink containment
  i zakresu danych dostępnych dla uploader'a.
- Validation Strategy: zatwierdzenie guardów, budżetu uploadu i minimalnego
  deployment smoke.
- Implementation Agent: wdrożyć Variant A bez dodatkowych zmian New Relic, pnpm
  lub architektury aplikacji.
