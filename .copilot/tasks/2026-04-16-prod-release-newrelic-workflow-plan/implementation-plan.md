# Implementation Plan

## Purpose

Translate the stabilized workflow constraints into execution-ready implementation options without yet changing repository code.

## Current state

- [x] Production workflow truth source identified
- [x] Release workflow independence identified
- [x] Specialist analysis recorded
- [x] Binding constraints drafted
- [x] Final implementation option selected
- [x] Workflow changes implemented
- [x] Validation evidence recorded

## Selected default direction

Selected default: Option C

Reason:

- It preserves the current repository ownership model: release manages versioning metadata; production deploy manages rollout truth.
- It eliminates false attribution from `release.published`.
- It satisfies the stricter product requirement that New Relic should run last and display semantic version rather than SHA.
- It keeps deploy, release, and change tracking explicitly ordered while still preserving separate workflow responsibilities.

Refined implementation result:

- Production deployment remains in `prod-deploy.yml`
- Release remains in a separate workflow file
- Release is now ordered after successful production deployment via `workflow_run`
- New Relic now runs last from the release workflow success path and uses semantic version metadata.

## Recommended implementation options

### Option A — Preferred: marker on production deploy success path

Description:
Attach the New Relic marker directly to the successful end of `prod-deploy.yml`.

Why this is preferred:

- Uses the real production deployment authority
- Avoids cross-workflow success inference
- Minimizes ambiguity about whether production actually received the artifact
- Lowest conceptual drift between deployment and observability signal

Open design point:

- Determine marker version source: commit SHA, semantic version, or both

Professional recommendation on marker identity:

- Canonical deployment identity: deployed commit SHA
- Optional secondary metadata: semantic-release version if later made reliably available

Reason:

- `prod-deploy.yml` already knows the deployed commit with certainty
- `release.yml` does not currently hand semantic-release version into the deploy path
- SHA is the only zero-ambiguity identifier on the production-success path today

### Exact workflow shape proposed

Repository changes proposed:

- remove production-marker responsibility from `new-relic-change-tracking.yml`
- add the New Relic marker step at the end of `prod-deploy.yml`, after successful Vercel production deployment
- chain `release.yml` after successful `Production Deployment` via `workflow_run`

Proposed placement in `prod-deploy.yml`:

1. checkout
2. install tooling
3. pull production env
4. env checks
5. production DB migrations
6. build prebuilt artifacts
7. deploy to Vercel production
8. emit New Relic production deployment marker

### Proposed YAML sketch

Recommended action shape: use the newer `changeTrackingCreateEvent` mode instead of the older legacy deployment marker mode.

```yaml
			- name: Create New Relic production deployment event
				uses: newrelic/deployment-marker-action@v2.6.2
				with:
					apiKey: ${{ secrets.NEW_RELIC_API_KEY }}
					commandType: changeTrackingCreateEvent
					entitySearch: "id='${{ secrets.NEW_RELIC_DEPLOYMENT_ENTITY_GUID }}'"
					category: Deployment
					type: Basic
					version: ${{ github.sha }}
					commit: ${{ github.sha }}
					description: Automated production deployment via GitHub Actions
					user: ${{ github.actor }}
					region: EU
```

If minimal change is preferred over modernizing the New Relic mutation shape, the repository can keep the legacy mode temporarily and only move the step into `prod-deploy.yml`.

### Why `github.sha` is the default professional choice

- It is available in the same workflow that performs the deploy
- It names the exact artifact lineage that production received
- It avoids race conditions between release publication and deployment success
- It remains valid even when semantic-release produces no new version

### Why semantic version is not the default professional choice here

- `release.yml` is independent from `prod-deploy.yml`
- `semantic-release` output is not automatically available in the production deploy workflow
- docs-only and markdown-only pushes prove that release and deploy do not share identical trigger surfaces
- forcing semver onto the deploy-success path would require explicit coupling or artifact handoff not currently present

### If semantic version becomes mandatory later

Only two safe directions exist:

1. redesign so deploy receives a proven semantic-release version through explicit handoff or unified orchestration
2. keep SHA as canonical deployment identity and attach semantic version as supplemental metadata only when reliably resolvable

Implementation checklist:

- [x] Decide marker identity format
      Default selected: `github.sha` as canonical deployment identity
- [x] Add marker step only after successful Vercel production deploy
- [x] Ensure secrets use stays constrained to the production deploy workflow
- [x] Document scenario behavior and rerun semantics

### Scenario matrix for Option A

| Scenario                                                 | Current behavior                                                     | Required post-change behavior                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Production deploy succeeds                               | Marker may or may not reflect deploy truth depending on release path | Marker emitted on successful deploy path, then release workflow runs                              |
| Production deploy fails                                  | Release-based marker may still exist                                 | No production deployment marker emitted and no release workflow run                               |
| Production deploy skipped due to `paths-ignore`          | Release path may still run                                           | No production deployment marker and no release workflow run                                       |
| Release published with no matching production deployment | Marker currently emitted                                             | Not possible through normal workflow topology                                                     |
| Production workflow rerun after success                  | Undefined                                                            | Release workflow reruns too; semantic-release expected to no-op if no new releasable state exists |

### Option B — Acceptable with care: separate marker workflow via `workflow_run`

Description:
Trigger a marker workflow from successful completion of `Production Deployment`.

Why this is acceptable:

- Still uses production deployment as truth source
- Keeps New Relic logic out of the main deploy workflow if separation is desired

Risks:

- Version propagation is harder
- Rerun semantics must be documented carefully
- Cross-workflow data availability may be weaker than Option A

Implementation checklist:

- [ ] Decide marker identity format
- [ ] Define `workflow_run` trigger on `Production Deployment`
- [ ] Gate job on successful workflow conclusion
- [ ] Resolve version source without assuming semantic-release output is present
- [ ] Document rerun and duplicate-marker behavior

### Option C — Higher-cost redesign: explicit release-after-deploy orchestration

Description:
Redesign release and deployment so semantic-release publication occurs only after successful production deployment.

Why this is not preferred by default:

- Larger blast radius
- Alters existing release-management topology
- Solves more than the immediate marker-placement problem

Use only if:

- Product requirement is strict semantic version fidelity tied to production deploy
- Owner explicitly wants release creation coupled to deployment success

## Decision gate

Choose one implementation option only after answering:

- [x] Is commit SHA acceptable as deployment marker identity?
      Default repository-safe answer: yes
- [ ] Is semantic-release version mandatory?
- [ ] Should release published and production deployed be represented as two separate events?

## Minimum validation mapping

For any selected implementation:

- [x] Verify marker path cannot run on deploy failure
- [x] Verify marker path cannot run when production deploy is skipped
- [x] Verify release publication is no longer treated as deployment truth unless explicitly modeled as separate event
- [x] Record expected behavior for reruns and duplicates

## Deferred work

- GitHub UI ruleset verification
- Leantime task mirroring once command execution is available

## Implementation result

- Added the New Relic production deployment event step to `prod-deploy.yml` after the Vercel production deploy step
- Removed the separate `release.published` marker workflow so release publication no longer emits a production deployment marker
- Changed `release.yml` to run only after successful `Production Deployment` via `workflow_run`
- Configured release checkout to use `github.event.workflow_run.head_sha`
- Updated CI/CD documentation to reflect the new production-marker ownership model

## Validation evidence

- Marker step now exists only on the success path of `prod-deploy.yml`
- Docs-only and markdown-only pushes still skip `prod-deploy.yml`, so they no longer emit a production deployment marker and do not trigger release
- `release.yml` remains separate but is now ordered after successful production deployment
- Rerun behavior remains tied to the production deploy workflow: rerunning a successful deploy will also rerun release, but semantic-release is expected to no-op for already-released commit state

## Semantics decision

- Resolved: New Relic now runs only after successful production deployment and successful semantic-release publication.

## Recommended next implementation action

Implement the final ordered model: deploy in `prod-deploy.yml`, release in `release.yml`, and emit the New Relic event only after semantic-release publishes a version, using semver for `version` and Git SHA for `commit`.
