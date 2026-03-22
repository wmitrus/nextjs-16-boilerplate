# Spec and build

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:

- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

---

## Workflow Steps

### [x] Step: Technical Specification

Assess the task's difficulty, as underestimating it leads to poor outcomes.

- easy: Straightforward implementation, trivial bug fix or feature
- medium: Moderate complexity, some edge cases or caveats to consider
- hard: Complex logic, many caveats, architectural considerations, or high-risk changes

Create a technical specification for the task that is appropriate for the complexity level:

- Review the existing codebase architecture and identify reusable components.
- Define the implementation approach based on established patterns in the project.
- Identify all source code files that will be created or modified.
- Define any necessary data model, API, or interface changes.
- Describe verification steps using the project's test and lint commands.

Save the output to `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/86abffac-14d1-4cdb-8405-870ae9fc872f/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach
- Source code structure changes
- Data model / API / interface changes
- Verification approach

If the task is complex enough, create a detailed implementation plan based on `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/86abffac-14d1-4cdb-8405-870ae9fc872f/spec.md`:

- Break down the work into concrete tasks (incrementable, testable milestones)
- Each task should reference relevant contracts and include verification steps
- Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint, write tests for a module). Avoid steps that are too granular (single function).

Save to `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/86abffac-14d1-4cdb-8405-870ae9fc872f/plan.md`. If the feature is trivial and doesn't warrant this breakdown, keep the Implementation step below as is.

---

### [x] Step: Implementation

Implement the task according to the technical specification and general engineering best practices.

1. Break the task into steps where possible.
2. Implement the required changes in the codebase.
3. Add and run relevant tests and linters.
4. Perform basic manual verification if applicable.
5. After completion, write a report to `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/86abffac-14d1-4cdb-8405-870ae9fc872f/report.md` describing:
   - What was implemented
   - How the solution was tested
   - The biggest issues or challenges encountered

---

### [x] Step: docs/features validation and fixes

Validate all files in `docs/features/` against current implementation state.

Validation report written to:
`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/86abffac-14d1-4cdb-8405-870ae9fc872f/docs-features-validation-report.md`

Required fixes (for Implementation Agent):

1. **`20 - Enterprise Security Architecture.md`** — CRITICAL: rewrite sections 2.1, 2.2, 4.2
   - `@/security/core/authorization` does not exist (no such file)
   - `context.user.role` does not exist in SecurityContext
   - `createSecureAction` API has no `role` field; requires `dependencies`

2. **`17 - Clerk Onboarding.md`** — MAJOR: fix file path in section 1
   - Wrong: `src/modules/auth/ui/onboarding-actions.ts`
   - Correct: `src/app/onboarding/actions.ts`

3. **`01 - Next.js 16 Readiness.md`** — MINOR: add `serverExternalPackages` and Sentry wrapper to config example
