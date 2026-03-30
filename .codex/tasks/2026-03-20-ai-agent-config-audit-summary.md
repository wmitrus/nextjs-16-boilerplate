# Audyt konfiguracji agentow AI, promptow i workflow

## 1. Objective

Celem tej zaktualizowanej wersji audytu bylo:

- ponownie ocenic source of truth po doprecyzowaniu roli `docs/ai/copilot` i `docs/ai/zencoder`
- sprawdzic zgodnosc `docs/ai/copilot` z realnymi agentami i promptami w `.github/*`
- sprawdzic zgodnosc `docs/ai/zencoder` z repo-hosted prompt sources w `docs/ai/general/01-09`
- sprawdzic, jak `.zenflow/workflows` mapuje sie do tego samego neutralnego flow
- ocenic, czy `general` i `templates` sa realnie uzywane, sensowne i gotowe do parity miedzy extensionami
- zaktualizowac dokumentacje tak, aby Zencoder byl opisany tak samo profesjonalnie jak Copilot, ale bez falszywego oczekiwania duplikacji runtime configu w repo

Zakres pozostawal konserwatywny:

- nie zmienialem runtime konfiguracji agentow
- nie zmienialem prompt content w `docs/ai/general`
- zaktualizowalem dokumentacje `docs/ai/zencoder`
- zaktualizowalem to summary

Wazne zalozenie:

- zgodnie z Twoim doprecyzowaniem zakladam, ze extension-level konfiguracja Zencodera poza repo rzeczywiscie wskazuje na `docs/ai/general/01-09`
- tego ostatniego nie da sie zweryfikowac samym repo, wiec ocena Zencodera dotyczy repo-hosted contract layer i workflow layer

---

## 2. Executive Summary

### Kluczowy wniosek

Po uwzglednieniu Twoich doprecyzowan obecny system jest dojrzalszy, niz wynika z poprzedniej wersji audytu.

Najwazniejsze korekty:

1. `docs/ai/copilot` jest poprawna cienka warstwa referencyjna do realnych agentow w `.github/*`.
2. `docs/ai/zencoder` powinno byc traktowane tak samo: jako cienka warstwa referencyjna do repo-hosted prompt sources i ZenFlow workflows, a nie jako miejsce przechowywania runtime configu extensiona.
3. `docs/ai/general/01-09` jest dzisiaj pelnym neutralnym katalogiem rol i prompt sources.
4. Zencoder nie jest "nieobecny" w repo. Jego runtime registration jest po prostu trzymany poza repo, natomiast repo zawiera:
   - neutralne prompt sources w `docs/ai/general/01-09`
   - human-facing mapping w `docs/ai/zencoder/*`
   - execution layer w `.zenflow/workflows/*`
   - default execution scripts w `.zenflow/settings.json`

### Zaktualizowany werdykt

- **Copilot**: bardzo dojrzaly adapter wykonawczy
- **Zencoder**: repo-documented adapter layer jest teraz czytelny i sensowny, ale sam runtime registration pozostaje poza zakresem audytu
- **General**: realny neutralny core dla rol `01-09`, auth-flow package i neutralnych workflow specs
- **Templates**: wiekszosc ma sens i jest realnie podpieta; glowna realna wada to pusty `security-review-template.md`
- **Cross-extension parity**: wysoka na poziomie ról i zasad, srednia na poziomie workflow execution i artifact conventions

### Najwazniejsze realne problemy

1. `docs/ai/templates/security-review-template.md` jest pusty, mimo ze workflowy na niego wskazuja.
2. Zencoder ma drift w artifact path conventions:
   - wiekszosc workflowow: `.zenflow/tasks/{task_id}`
   - `incident-investigation.md`: `docs/workflows/{task_id}`
3. `general` zawiera mieszane brandingowo pliki artifact/task-brief:
   - `docs/ai/general/COPILOT_TASK_ARTIFACTS.md`
   - `docs/ai/templates/COPILOT_TASK_BRIEF_TEMPLATE.md`
4. Neutralne workflow specs i extension-specific execution layers sa juz sensownie rozdzielone, ale trzeba pilnowac driftu miedzy:
   - `docs/ai/general/Workflow 01-03`
   - `.github/prompts/*`
   - `.zenflow/workflows/*`

---

## 3. Current-State Findings

### 3.1 Inwentarz

| Obszar                       | Lokalizacja              | Stan                                                                           |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| Neutralny core               | `docs/ai/general`        | 23 pliki, w tym role `00-09`, auth-flow package, workflow specs, artifact docs |
| Copilot guide                | `docs/ai/copilot`        | 10 plikow markdown, cienka warstwa referencyjna                                |
| Zencoder guide               | `docs/ai/zencoder`       | 10 plikow markdown, cienka warstwa referencyjna                                |
| Shared templates             | `docs/ai/templates`      | 7 top-level templates + 8 specialist summary templates                         |
| Copilot runtime agents       | `.github/agents`         | 8 plikow                                                                       |
| Copilot runtime prompts      | `.github/prompts`        | 6 plikow                                                                       |
| Copilot runtime instructions | `.github/instructions`   | 3 pliki                                                                        |
| Zencoder workflow layer      | `.zenflow/workflows`     | 4 workflow files                                                               |
| Zencoder execution defaults  | `.zenflow/settings.json` | setup/dev/verification scripts                                                 |
| Repo-local Zencoder rule     | `.zencoder/rules`        | 1 plik repo rule                                                               |

### 3.2 Mapa warstw

| Warstwa                           | Lokalizacja                                                                   | Rola                                                         |
| --------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Neutral role/spec core            | `docs/ai/general/01-09`                                                       | wspolne prompt sources i specjalizacje                       |
| Neutral protocol/context core     | `docs/ai/general/00`, `REPOSITORY_AI_CONTEXT`, `MODE_MANIFEST`, `AUTH_FLOW_*` | zasady, authority model, context, auth-flow governance       |
| Neutral workflow design           | `docs/ai/general/Workflow 01-03`                                              | neutralne workflow specs                                     |
| Copilot reference layer           | `docs/ai/copilot/*`                                                           | mapping dla ludzi do `.github/*`                             |
| Copilot executable adapter        | `.github/agents`, `.github/prompts`, `.github/instructions`                   | runtime adapter dla GitHub Copilot                           |
| Zencoder reference layer          | `docs/ai/zencoder/*`                                                          | mapping dla ludzi do `general` i `.zenflow`                  |
| Zencoder workflow execution layer | `.zenflow/workflows/*`, `.zenflow/settings.json`                              | repo-hosted execution contract dla Zencodera                 |
| Shared artifact/templates layer   | `docs/ai/templates/*`                                                         | output shape, review docs, task brief, auth verification run |

### 3.3 Source of truth po korekcie

Source of truth nie jest jeden, ale jest juz sensownie warstwowy:

- neutralne role i prompt sources: `docs/ai/general/01-09`
- neutralne zasady i auth-flow governance: `docs/ai/general/00`, `AUTH_FLOW_*`, `REPOSITORY_AI_CONTEXT.md`
- neutralne workflow specs: `docs/ai/general/Workflow 01-03`
- Copilot runtime execution: `.github/*`
- Zencoder repo-hosted execution contract: `.zenflow/workflows/*` i `.zenflow/settings.json`
- Zencoder extension registration: poza repo

To jest poprawna architektura, o ile nie probujemy wymuszac, zeby kazdy extension trzymal runtime config w tym samym miejscu.

---

## 4. Compatibility Audit

### 4.1 `docs/ai/copilot` -> `.github/*`

Ocena: **wysoka**

To jest dobrze zaprojektowany adapter documentation layer:

- wskazuje realne pliki agentow i promptow
- nie duplikuje execution content
- tlumaczy kiedy uzyc konkretnego agenta lub promptu
- zachowuje cienka, onboardingowa role

Najwazniejsze: brak duplikacji nie jest wada, tylko dobra decyzja architektoniczna.

### 4.2 `.github/*` -> `docs/ai/general`

Ocena: **wysoka semantycznie, srednia do wysokiej mechanicznie**

Najmocniejsze punkty zgodnosci:

- realni agenci Copilota sa spojni z authority model i specialization model z `general`
- mocno korzystaja z `00 - Agent Interaction Protocol`
- korzystaja z `REPOSITORY_AI_CONTEXT`
- auth-sensitive flow korzysta z tego samego auth-flow package
- `07` i `08` maja juz neutralne odpowiedniki w `docs/ai/general`

Wniosek:

- Copilot adapter jest zgodny z neutralnym core
- nie kazdy runtime file musi bezposrednio include'owac swoj neutralny odpowiednik, zeby architektura byla poprawna
- wazniejsze jest utrzymanie zgodnosci semantycznej i workflow discipline

### 4.3 `docs/ai/zencoder` -> `docs/ai/general/01-09`

Ocena: **wysoka**

Ta warstwa jest teraz czytelna i profesjonalna:

- `README.md` wyjasnia, ze runtime registration Zencodera jest poza repo
- role `01-09` sa jawnie mapowane do `docs/ai/general/01-09`
- `08` i `09` poprawnie podpinaja `.zenflow/workflows/*` jako execution layer
- dokumentacja nie probuje duplikowac prompt content, tylko dokumentuje mapping

To jest wlasnie poprawny odpowiednik patternu `docs/ai/copilot`.

### 4.4 `.zenflow/workflows` -> `docs/ai/general` / `docs/ai/templates`

Ocena: **wysoka co do intentu, srednia co do dopracowania**

Silne strony:

- `feature-development.md`, `safe-refactor.md`, `security-incident-workflow.md` konsekwentnie route'uja do tych samych specialist roles
- workflowy korzystaja ze wspolnych templates:
  - `architecture-review-template.md`
  - `security-review-template.md`
  - `runtime-review-template.md`
  - `constraints-template.md`
  - `validation-template.md`
- artifact discipline jest jawna
- `.zenflow/settings.json` ustawia sensowny verification baseline:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm arch:lint`
  - `pnpm test`

Luki:

- `incident-investigation.md` ma inna konwencje artifacts path niz pozostale workflowy
- `security-review-template.md` jest pusty, co oslabia caly security path
- repo ma neutralne workflow specs dla feature/refactor/security incident, ale nie ma rownoleglego neutral workflow doc dla incident investigation

### 4.5 Cross-extension parity

| Wymiar                 | Ocena          | Komentarz                                                                                                                |
| ---------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Role parity `01-09`    | wysoka         | oba extension docs mapuja sie do tego samego neutralnego katalogu rol                                                    |
| Governance parity      | wysoka         | oba swiaty korzystaja z tych samych auth-flow rules i neutralnych constraintow                                           |
| Task brief discipline  | wysoka         | `general/09`, `copilot/09`, `zencoder/09` sa spojne co do modelu brief -> workflow -> specialists                        |
| Workflow intent parity | srednio-wysoka | Copilot ma prompt/instruction adapter, Zencoder ma ZenFlow workflow adapter; intent jest ten sam, execution surface inna |
| Artifact parity        | srednia        | oba flow sa artifact-first, ale pathy i branding nie sa jeszcze w pelni ujednolicone                                     |
| Runtime audytowalnosc  | srednia        | Copilot runtime jest w repo, Zencoder runtime registration jest poza repo                                                |

Wniosek:

Jesli pytanie brzmi "czy oba extensiony sa w stanie robic zasadniczo ten sam rodzaj pracy?", odpowiedz brzmi: **tak, w duzej mierze tak**.

Jesli pytanie brzmi "czy oba extensiony maja juz identyczny, w pelni audytowalny execution layer w repo?", odpowiedz brzmi: **nie**.

---

## 5. File Usefulness And Categorization

### 5.1 `docs/ai/general`

Wiekszosc plikow ma sens i nie wyglada na martwa dokumentacje.

Najlepsza kategoryzacja tej warstwy to:

#### Neutral specialist prompt sources

- `00 - Agent Interaction Protocol.md`
- `01 - Architecture Guard Agent.md`
- `02 - Security & Auth Agent.md`
- `03 - Next.js Runtime Agent.md`
- `04 - Implementation Agents.md`
- `05 - Validation Strategy Agent.md`
- `06 - Debug Investigation Agent.md`
- `07 - Playwright E2E Agent.md`
- `08 - Workflow Orchestrator Agent.md`
- `09 - Task Brief Authoring.md`

#### Neutral governance / context

- `REPOSITORY_AI_CONTEXT.md`
- `MODE_MANIFEST.md`
- `PROMPT_SYSTEM_VALIDATION.md`
- `ARCHITECTURE_LINT_RULES.md`
- `README-ARCHITECTURE_LINT.md`

#### Auth-flow package

- `AUTH_FLOW_ANTI_PATTERNS.md`
- `AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `AUTH_FLOW_VERIFICATION_MATRIX.md`

#### Neutral workflow specs

- `Workflow 01 - Safe Feature Workflow.md`
- `Workflow 02 - Safe Refactor Workflow.md`
- `Workflow 03 - Security Incident Workflow.md`

#### Artifact / task orchestration docs

- `ARTIFACTS_GUIDE.md`
- `COPILOT_TASK_ARTIFACTS.md`

Ocena:

- ta warstwa jest potrzebna
- nie widze tutaj oczywistych plikow do wyrzucenia
- glowny problem nie polega na bezuzytecznosci, tylko na branding drift i cross-layer drift risk

### 5.2 `docs/ai/templates`

Tu poprzednia ocena wymagala korekty, bo ZenFlow workflowy realnie aktywuja kilka z tych template'ow.

#### Templates realnie operacyjne

- `architecture-review-template.md`
- `runtime-review-template.md`
- `constraints-template.md`
- `validation-template.md`
- `AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`
- `COPILOT_TASK_BRIEF_TEMPLATE.md`
- `docs/ai/templates/specialist-summaries/*`

Powod:

- ZenFlow workflowy wprost odwoluje sie do review/constraints/validation templates
- `09 - Task Brief Authoring` korzysta z task brief template
- auth-flow verification ma osobny, sensowny final-run template
- Copilot instructions i artifacts discipline korzystaja ze specialist summaries

#### Template z realna wada

- `docs/ai/templates/security-review-template.md`

Stan:

- pusty plik
- workflowy w `.zenflow/workflows/*` na niego wskazuja
- security path bez tego template'u jest niespojne i slabsze niz pozostale review pathy

To jest jedyny plik, ktory mozna dzisiaj nazwac realnie niedokonczonym.

### 5.3 Co warto uporzadkowac

Najbardziej sensowna przyszla kategoryzacja `docs/ai/templates`:

- `reviews/`
  - architecture
  - security
  - runtime
  - validation
- `task-briefs/`
  - brief template
- `auth-flow/`
  - auth verification run template
- `specialist-summaries/`
  - per-role summary templates

To nie jest pilne, ale poprawiloby czytelnosc.

---

## 6. Architectural Assessment

### 6.1 Co jest naprawde dobrze zaprojektowane

#### Copilot

To nadal najmocniejszy i najbardziej kompletny execution adapter w repo:

- ma realnych agentow
- ma realne prompty
- ma always-on instructions
- ma czytelna artifact discipline
- ma dobre sprzezenie z auth-flow package

#### Zencoder

Po poprawnym zinterpretowaniu jego modelu architektura tez ma sens:

- runtime registration jest poza repo, zgodnie ze standardem extensiona
- repo przechowuje neutralne prompt sources
- repo przechowuje thin mapping docs
- repo przechowuje workflow execution layer

To nie jest slabosc sama w sobie. To po prostu inny punkt trzymania runtime configu.

#### General

`docs/ai/general` jest juz wystarczajaco kompletne, zeby byc wspolnym core dla wielu adapterow, bo ma:

- role `01-09`
- protocol `00`
- auth-flow package
- workflow specs
- context docs

### 6.2 Gdzie jest realny architectural debt

#### Drift risk miedzy trzema warstwami workflow

Dzisiaj sa trzy reprezentacje workflow:

1. neutralne workflow specs w `docs/ai/general/Workflow 01-03`
2. Copilot execution entrypoints w `.github/prompts/*`
3. Zencoder execution entrypoints w `.zenflow/workflows/*`

To jest zrozumiale i nawet zdrowe, ale wymaga dyscypliny.

Najwieksze ryzyko nie brzmi "za duzo plikow", tylko:

- czy te trzy warstwy beda nadal opisywaly ten sam flow
- czy nazewnictwo i artifact expectations nie zaczna sie rozjezdzac

#### Branding drift w neutralnych warstwach

Najbardziej widoczne przypadki:

- `COPILOT_TASK_ARTIFACTS.md` w `docs/ai/general`
- `COPILOT_TASK_BRIEF_TEMPLATE.md` jako wspolny template

To nie blokuje kompatybilnosci, ale zaciemnia fakt, ze te materialy sa juz de facto shared.

#### Zencoder runtime verification gap

Nie mozna w 100% potwierdzic z repo, ze extension-side registration Zencodera faktycznie wskazuje na dokladnie te same pliki `01-09`.

To nie jest wada dokumentacji, tylko granica audytu.

---

## 7. Risks And Tradeoffs

## Must-fix

1. `docs/ai/templates/security-review-template.md` jest pusty.
2. `incident-investigation.md` ma niezgodna konwencje artifacts path.

## Should-fix

1. Warto zneutralizowac branding shared files:
   - `COPILOT_TASK_ARTIFACTS.md`
   - `COPILOT_TASK_BRIEF_TEMPLATE.md`
2. Warto pilnowac parity miedzy:
   - `docs/ai/general/Workflow 01-03`
   - `.github/prompts/*`
   - `.zenflow/workflows/*`
3. Warto rozwazyc neutralny workflow spec dla incident investigation, jesli ten flow ma byc stale wspolny miedzy extensionami.

## Nice-to-have

1. Mozna dopisac specialist summary templates dla `08` i `09`, jesli chcesz miec pelna symmetry takze na warstwie summary artifacts.
2. Mozna docelowo rozdzielic `docs/ai/copilot` i `docs/ai/zencoder` pod wspolny prefix typu `docs/ai/extensions/*`, ale to porzadkowanie, nie koniecznosc.

Tradeoff:

- im bardziej wszystko zunifikujesz, tym latwiej utrzymac parity
- im bardziej bedziesz szanowal natywne wzorce extensionow, tym mniej sztucznej duplikacji

Obecny kierunek jest dobry, jesli neutralny core pozostaje wspolny, a adaptery pozostaja cienkie.

---

## 8. Documentation Update Applied

W tej rewizji dokumentacja zostala dopieta pod ten model:

- `docs/ai/zencoder/README.md`
- `docs/ai/zencoder/01 - Architecture Guard Agent.md`
- `docs/ai/zencoder/02 - Security & Auth Agent.md`
- `docs/ai/zencoder/03 - Next.js Runtime Agent.md`
- `docs/ai/zencoder/04 - Implementation Agents.md`
- `docs/ai/zencoder/05 - Validation Strategy Agent.md`
- `docs/ai/zencoder/06 - Debug Investigation Agent.md`
- `docs/ai/zencoder/07 - Playwright E2E Agent.md`
- `docs/ai/zencoder/08 - Workflow Orchestrator Agent.md`
- `docs/ai/zencoder/09 - Task Brief Authoring.md`

Cel tej warstwy:

- nie duplikowac runtime promptow extensiona
- dokumentowac mapping do `docs/ai/general/01-09`
- dokumentowac role `.zenflow/workflows/*`
- dokumentowac fakt, ze runtime registration Zencodera jest trzymany poza repo

To jest wlasciwy odpowiednik patternu zastosowanego w `docs/ai/copilot`.

---

## 9. Final Verdict

### Profesjonalna ocena obecnego stanu

1. `docs/ai/general` jest dzisiaj realnym neutralnym core, a nie tylko luźnym zbiorem pomyslow.
2. `docs/ai/copilot` jest bardzo dobra, cienka warstwa referencyjna nad realnym adapterem `.github/*`.
3. `docs/ai/zencoder` po uzupelnieniu jest poprawna, cienka warstwa referencyjna nad:
   - neutralnym core `docs/ai/general/01-09`
   - Zencoder workflow layer w `.zenflow/workflows/*`
   - external runtime registration
4. Copilot i Zencoder sa juz duzo blizej wspolnego flow, niz sugerowala poprzednia wersja audytu.
5. Najwieksze pozostale braki nie dotycza samego modelu adapterow, tylko:
   - pustego security template
   - artifact path drift
   - branding drift w shared files
   - ograniczonej audytowalnosci extension-side runtime configu Zencodera

### Krotko

- **Copilot docs**: bardzo dobre
- **Copilot runtime adapter**: bardzo dobry
- **Zencoder docs**: po uzupelnieniu dobre i sensownie zmapowane
- **Zencoder workflow layer**: sensowna i zgodna z neutralnym core, ale wymaga dopracowania security template i artifacts path parity
- **General**: dobry neutralny rdzen
- **Templates**: prawie wszystkie maja sens; jeden istotny plik jest pusty

---

## 10. Verification Note

Ta rewizja audytu zostala oparta na przegladzie:

- `docs/ai/general/*`
- `docs/ai/copilot/*`
- `docs/ai/zencoder/*`
- `.github/agents/*`
- `.github/prompts/*`
- `.github/instructions/*`
- `.zenflow/workflows/*`
- `.zenflow/settings.json`
- `docs/ai/templates/*`

W tej rewizji nie zmienialem runtime konfiguracji agentow.

Zmiany dotyczyly tylko:

- dokumentacji `docs/ai/zencoder`
- tego summary
