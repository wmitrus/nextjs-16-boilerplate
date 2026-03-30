# Fix bug

## Workflow Steps

### [x] Step: Investigation and Planning

Analyze the bug report and design a solution.

1. Review the bug description, error messages, and logs
2. Clarify reproduction steps with the user if unclear
3. Check existing tests for clues about expected behavior
4. Locate relevant code sections and identify root cause
5. Propose a fix based on the investigation
6. Consider edge cases and potential side effects

Save findings to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/2a635837-4b28-4726-8029-61eadacc1082/investigation.md` with:

- Bug summary
- Root cause analysis
- Affected components
- Proposed solution

### [x] Step: Implementation (reverted — build error)

Previous attempt used `next/dynamic` with `ssr: false` directly in a Server Component.
Next.js App Router **does not allow** `ssr: false` in Server Components — it must live in a `'use client'` component.

### [x] Step: Correct Implementation (reverted — functional regression)

`next/dynamic` + `ssr: false` renders `null` server-side — the skeleton only appears client-side, causing Clerk form to never appear.

### [x] Step: Final Correct Implementation

Use `useEffect` + `useState(mounted)` inside the Client Component.

- Server renders skeleton (mounted=false initial state)
- Client hydrates with same skeleton → no mismatch
- After useEffect → Clerk component mounts → no hydration error, form appears

Proper Next.js App Router pattern:

1. Create `sign-up-client.tsx` (`'use client'`) that owns `dynamic(..., { ssr: false })`
2. Create `sign-in-client.tsx` (`'use client'`) same
3. Server Component pages import and render these client wrappers
4. Update page tests to mock the client wrapper modules
5. Run tests, typecheck, lint
