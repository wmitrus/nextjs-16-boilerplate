Zrób to jak krótki, kontrolowany test regresji, nie jako luźne klikanie.

# Kolejność

## 1. Przygotuj czyste środowisko

Przed serią testów:

- uruchom docelowy backend DB
- upewnij się, że masz właściwe env dla Clerk redirectów
- wyczyść stan testowego użytkownika albo przygotuj:
  - jedno świeże konto
  - jedno konto już onboardowane
  - jedno konto nieukończone

Dobrze też:

- otworzyć terminal z pnpm dev
- mieć otwarte logi aplikacji
- mieć otwarte DevTools:
  - Network
  - Console
  - Application/Cookies

## 2. Wykonuj scenariusze po kolei z matrixa

Nie wszystko naraz. Zacznij od minimum:

### AF-01 / AF-02 / AF-03 / AF-04

nowy user:

- sign-up
- bootstrap/start
- onboarding
- submit
- /users

### AF-05

returning onboarded user:

- wyloguj
- zaloguj ponownie
- powinien wejść prosto na /users

### AF-06 / AF-07

user nieukończony:

- zaloguj takim kontem
- sprawdź czy idzie na /onboarding, nie wisi na /users

### AF-08 / AF-09

ręczne wejście:

- /users po ukończeniu
- /onboarding po ukończeniu

### AF-12 / AF-13 / AF-14 / AF-15

sygnał cookie:

- sprawdź czy cookie jest ustawiane tylko tam, gdzie powinno
- sprawdź czy znika po ukończeniu onboardingu
- sprawdź że DB nadal jest prawdą

### AF-17 / AF-18 / AF-21

stabilność runtime:

- brak blocking-route
- brak Rendering...
- brak wyścigu /users -> /onboarding

# Co zapisywać przy każdym scenariuszu

Dla każdego ID z matrixa zapisz tylko:

- status: PASS / FAIL / DEFERRED
- co zrobiłeś
- co się stało
- najważniejszy dowód:
  - URL końcowy
  - 1–2 kluczowe logi
  - ewentualnie cookie / network

Przykład wpisu:

```md
AF-03 — PASS
Nowy user wypełnił onboarding, submit przeszedł, redirect na /users.
Dowód:

- POST /onboarding?redirect_url=%2Fusers 303
- users_guard:decision => ALLOWED
- onboardingComplete: true
```

# Na co patrzeć w runtime

Podczas testów sprawdzaj zawsze te same rzeczy:

URL

- czy kończysz na właściwej trasie

Logi serwera

- users_guard:decision
- onboarding_guard:decision
- provisioning:ensure:\*
- błędy runtime

Browser / DevTools

- czy nie ma Rendering...
- czy nie ma blocking-route
- czy route commit wygląda poprawnie
- czy nie ma starych probe errors

Cookies

- czy \_\_onboarding_pending pojawia się i znika wtedy, kiedy powinno

Jak to zrobić profesjonalnie organizacyjnie

Najlepiej:

- jeden plik AUTH_FLOW_VERIFICATION_MATRIX.md
- dopisujesz statusy ręcznie
- jedna sekcja na daną rundę testów, np.:

```md
## Verification Run — 2026-03-19

Environment: local dev, postgres
Branch: feat/auth-flow-fix
Clerk redirect target: /auth/bootstrap/start?redirect_url=/users
```

Pod tym uzupełniasz scenariusze.

# Kiedy uznać flow za zweryfikowany

Dopiero gdy:

- wszystkie scenariusze minimum są PASS
- nie ma Rendering...
- nie ma blocking-route
- onboarding cookie działa poprawnie
- returning user działa poprawnie
- ręczne wejścia na /users i /onboarding zachowują się poprawnie

# Czego nie robić

- nie testuj tylko jednego przypadku
- nie opieraj się wyłącznie na “na oko działa”
- nie zamykaj taska bez wpisania wyników do matrixa
- nie mieszaj wielu kont i wielu stanów bez notatek
