You are a Principal DevSecOps Architect.

Design a lean enterprise CI/CD system for an existing Next.js 16 App Router project.

Existing workflows:

auto-assign

deployChromatic

label

release (semantic release)

You must add:

pr-validation

preview-deploy (vercel preview)

prod-deploy (vercel production)

lighthouse performance pipeline

security-scan pipeline

optional label-triggered e2e

Constraints:

default branch = main

prevent PR from main

no develop branch

minimal CI runtime

Next.js 16 + turbopack

server actions

edge runtime

vercel prebuilt deployments

reuse artifacts

conditional workflows

label-trigger heavy jobs

integrate with existing workflows

analyze docs/features/\*\*

maintain backward compatibility

Output:

full workflow architecture

github rulesets config

required status checks

yaml workflows

env strategy

rollout plan

migration plan

vscode governance recommendations

husky local protections

ci runtime optimization

🧭 IMPLEMENTATION ORDER (VERY IMPORTANT)
Step 1 — GitHub Rulesets (NOT CI)

fix governance first.

Step 2 — pr-validation

becomes required check.

Step 3 — preview-deploy

developers get instant feedback.

Step 4 — prod-deploy

controlled releases.
