# Intake

## Objective

Make specialist agents follow stricter workflow discipline for task artifacts, including a stable `NN - Agent Name - Summary.md` naming convention and professional per-agent summary templates.

## Readiness Checklist

- [x] Objective confirmed
- [x] Requirements source confirmed
- [x] Scope confirmed
- [x] Non-goals confirmed
- [x] Specialist agent files reviewed
- [x] Artifact naming convention finalized
- [x] Update targets finalized

## Requirements Summary

- every specialist agent should know it must update task control artifacts before moving to the next major step
- every specialist agent should maintain a single per-agent summary file under the task directory
- the summary file should capture what the agent did, tasks performed, findings, and summary notes
- if the same agent runs multiple times for the same task, it should update its existing file instead of creating a new one
- the file name should follow the `NN - Agent Name - Summary.md` pattern
- each specialist summary should start from a matching template and keep a common professional section structure
- exclude the Workflow Orchestrator from this per-agent summary-file requirement because orchestrator already owns the main design/control artifacts

## Scope

- shared workflow instructions
- specialist agent definitions and docs
- artifact-system documentation

## Non-Goals

- changing the orchestrator artifact ownership model
- changing task-specific auth regression requirements
- implementing product code

## Acceptance Criteria

- repository guidance clearly states that specialists must update control artifacts before progressing
- repository guidance clearly states that each specialist maintains one persistent per-agent task summary artifact
- naming convention for those per-agent artifacts is explicit and stable
- repeated runs by the same specialist are documented as updates to the same file
- specialist summary templates exist for all non-orchestrator specialist agents

## Open Questions

- resolved: enforce the rule in shared workflow instructions, specialist agent definitions, and template references
