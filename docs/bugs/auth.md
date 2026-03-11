# Use the Security Incident Workflow, but in practice treat it as:

auth/provisioning incident workflow

## Reason:

- it touches Clerk
- it touches org / tenant context
- it touches provisioning into the database
- it happens during sign up
- it may affect:
  - trust boundaries
  - provider isolation
  - membership/org source of truth
  - data consistency
  - partly security correctness

This does not necessarily mean a “data leak” or a classic security breach.
But it is a security-sensitive auth bug, so this workflow is the safest one.

## What I would not do

I would not start immediately with:

- the Implementation Agent alone
- the Safe Refactor Workflow alone
- a “quick fix”

Because you yourself already wrote that:

- several AIs failed on this,
- the problem is leaky,
- provisioning + Clerk + DB + env vars + signup are falling apart,
- it is easy to make an apparent fix here that breaks another case.

## Best strategy

### Stage 1 — Security Incident Workflow

The goal is not to immediately “fix everything”, but to:

- understand the flow precisely
- find:
  - source of truth
  - trust boundaries
  - who creates org / tenant context
  - when provisioning is allowed to happen
  - what is required vs optional
  - where signup is failing
- define minimal safe remediation

### Stage 2 — if a structural mess emerges

Only afterwards, if it turns out that:

- the flow is architecturally inconsistent,
- provisioning is embedded incorrectly,
- the env strategy is causing chaos,

then after the fix or alongside the fix you do:
Safe Refactor Workflow to put things in order.

So:

- first the fix workflow, then optionally the refactor workflow
- not the other way around.

## Why the Security Incident Workflow fits best

Because it starts with:

- Security/Auth Agent
- then optionally Next.js Runtime Agent
- then Architecture Guard Agent, if the fix threatens drift

And here that is exactly the right order.

In your case, the most important questions are not so much “how to refactor this nicely”, but:

- who is the source of truth for org/tenant?
- what does Clerk do, and what does the database do?
- when should provisioning happen?
- what if env vars switch the mode?
- what should happen during sign-up if provisioning partially fails?
- should signup be blocked, or should there be retry/compensation?
- is there a race / inconsistency / double provisioning issue?
- are onboarding/layout/server actions reading the state too early?

This is first a correctness + trust model problem, and only then a refactor problem.

## How I would run this

### Practical version

You run the Security Incident Workflow, but you describe the problem so that the agent does not treat it as a “hacker incident”, but rather as:

- a critical auth/provisioning bug
- a tenant/org consistency issue
- a signup failure with provider/database synchronization complexity

## Ready-to-use starting prompt

Paste this into Codex:

```text
Use Security Incident Workflow for this issue.

This is not a generic feature task and not a pure cleanup refactor.

Problem type:
auth/provisioning incident

Context:
- the repository uses Clerk
- database behavior depends on env configuration
- depending on env vars, some org/tenant-related state comes from Clerk and some from the database
- there is provisioning/synchronization from Clerk into the database
- the sign-up flow is currently fragile and repeatedly breaks
- previous AI attempts failed to fix it safely
- the issue is likely related to auth boundaries, tenancy/org source-of-truth, provisioning timing, and inconsistent flow assumptions

I want this handled as a security-sensitive auth/tenancy/provisioning bug, not as a superficial patch.

Your task now:
1. classify the incident
2. identify the trust boundary
3. identify the source-of-truth problem
4. identify the provisioning flow and where it can break
5. identify likely affected files/modules
6. determine whether runtime review is needed
7. determine whether architecture review is needed
8. do not implement yet unless constraints are already clear

Return:
1. Incident classification
2. Trust-boundary assessment
3. Source-of-truth analysis
4. Likely failure points in sign-up / provisioning flow
5. Affected files/modules
6. Which specialist reviews must run next
7. Initial remediation direction
```

## My final verdict

Yes, the fix workflow will be very useful here.
And specifically:

- now: Security Incident Workflow
- later, if structural disorder emerges: Safe Refactor Workflow

This is the safest and most professional path for this problem.
