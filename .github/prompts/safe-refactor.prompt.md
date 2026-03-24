---
description: 'Start a behavior-preserving refactor task through the Workflow Orchestrator using the safe-refactor workflow sequence.'
name: 'Safe Refactor'
argument-hint: 'Refactor description, affected modules, expected invariants to protect, or known risks'
agent: 08 - Workflow Orchestrator
---

Start a behavior-preserving refactor task using `08 - Workflow Orchestrator`.

Task input package:

- treat the user request as the refactor description
- treat attached files and referenced repository documents as the authoritative requirement sources
- do not invent scope that is not supported by the provided materials or repository evidence

Required workflow:

- create `.copilot/tasks/{task_id}/plan.md` first
- create `intake.md` immediately after `plan.md`
- in `intake.md`, normalize the objective, refactor scope, protected invariants, non-goals, acceptance criteria, and open questions
- classify the refactor: is it ownership/boundary cleanup, DI restructuring, naming/organization, or something else?
- run Architecture Guard first — verify module boundaries and DI discipline remain intact after the refactor
- run Security/Auth review only when the refactor touches auth flows, trust boundaries, provider isolation, or sensitive-data handling
- run Next.js Runtime review only when the refactor touches App Router structure, server/client boundaries, route handlers, or caching behavior
- consolidate specialist outputs into `constraints.md` before implementation begins
- require every non-orchestrator specialist to create or update one persistent task summary file named with its agent number and name plus ` - Summary.md`
- implementation must respect the protected invariants defined in `intake.md` and `constraints.md`
- do not let Implementation Agent alter behavior beyond the refactor scope
- after each meaningful step, update the relevant checklist state in `plan.md` and `intake.md` before moving forward

Refactor discipline:

- behavior must be provably equivalent before and after
- do not mix refactor changes with feature additions
- identify the exact invariants that must be preserved
- stop and report if the refactor would require changing contracts, public behavior, or module ownership without explicit approval

Required output:

1. Objective
2. Input Sources
3. Refactor Classification
4. Protected Invariants
5. Planned Specialist Sequence
6. Artifacts To Be Produced
7. Recommended Next Action
