# Task Artifacts Guide

## Purpose

This document defines the artifacts generated during AI-assisted workflows
and explains their meaning, authority level, and how agents must use them.

Artifacts provide a structured handoff between workflow steps and ensure
that decisions made in earlier stages are preserved during later stages.

Artifacts are generated inside the task workspace.

Default location depends on the active AI tool:

- **GitHub Copilot**: `.copilot/tasks/{task_id}/`
- **Zencoder**: `.zencoder/chats/{chat_id}/` — resolved automatically by Zencoder from the active chat session

Each tool uses its own artifact path. Do not mix paths between tools.
For Copilot, create the task directory explicitly. For Zencoder, the chat workspace is managed automatically — write artifacts into the active chat directory.

## Artifact Authority Model

Artifacts fall into three categories:

### Binding Artifacts

Binding artifacts define **constraints that must be respected by later steps**.

Agents must:

- read them before producing output
- treat them as authoritative instructions
- not override them unless a blocking issue is explicitly documented

Examples:

constraints.md  
05 - Validation Strategy - Summary.md

### Analytical Artifacts

These contain analysis performed by specialist agents.

They provide reasoning and risk identification but may not be strictly binding.

Agents should:

- read them before producing output
- reference them when making decisions
- escalate conflicts instead of ignoring them

Examples:

01 - Architecture Guard - Summary.md  
02 - Security & Auth - Summary.md  
03 - Next.js Runtime - Summary.md

### Informational Artifacts

These describe the task context and outcomes.

They provide traceability but usually do not impose constraints.

Examples:

plan.md  
intake.md  
04 - Implementation Agent - Summary.md  
validation-report.md

## Standard Artifact Set

Most workflows produce the following artifacts.

### refactor-intake.md

Purpose:
Initial classification of the task.

Typical contents:

- task description
- intended invariants
- affected modules
- suspected architecture smells
- scope boundaries

Authority:
Informational.

### incident-intake.md

Purpose:
Describe the security or production incident being investigated.

Typical contents:

- vulnerability description
- affected components
- observed symptoms
- suspected root cause
- severity assessment

Authority:
Informational.

### 01 - Architecture Guard - Summary.md

Produced by:
Architecture Guard Agent.

Purpose:
Verify that the proposed change respects repository architecture.

Typical contents:

- affected layers
- dependency direction analysis
- boundary risks
- provider isolation
- architecture constraints

Authority:
Analytical.

### 02 - Security & Auth - Summary.md

Produced by:
Security/Auth Agent.

Purpose:
Identify security risks and trust-boundary issues.

Typical contents:

- auth and authorization impact
- tenancy isolation
- sensitive data handling
- provider isolation
- cache or runtime risks
- security constraints

Authority:
Analytical.

### 03 - Next.js Runtime - Summary.md

Produced by:
Next.js Runtime Agent.

Purpose:
Analyze runtime behavior and Next.js execution context.

Typical contents:

- server vs client placement
- route handler behavior
- server actions
- middleware / proxy behavior
- caching and revalidation
- edge vs node runtime
- environment exposure risks

Authority:
Analytical.

### constraints.md

Produced by:
Constraint consolidation step.

Purpose:
Summarize all structural, security, and runtime constraints.

Typical contents:

- architecture constraints
- security constraints
- runtime constraints
- validation constraints
- explicitly allowed changes
- explicitly forbidden changes
- protected invariants

Authority:
Binding.

All implementation must respect this file.

### 05 - Validation Strategy - Summary.md

Produced by:
Validation Strategy Agent.

Purpose:
Define the minimum validation necessary for safe implementation.

Typical contents:

- required tests
- optional additional tests
- validation commands
- validation risks

Authority:
Binding.

### 04 - Implementation Agent - Summary.md

Produced by:
Implementation Agent.

Purpose:
Describe the changes made during implementation.

Typical contents:

- files modified
- design decisions
- deviations from plan
- tests added or updated

Authority:
Informational.

### validation-report.md

Produced by:
Validation step.

Purpose:
Document validation results.

Typical contents:

- commands executed
- test results
- lint/typecheck status
- architecture lint results
- unresolved issues

Authority:
Informational.

## Artifact Dependency Chain

Typical dependency flow:

refactor-intake.md  
↓  
01 - Architecture Guard - Summary.md  
↓  
02 - Security & Auth - Summary.md  
↓  
03 - Next.js Runtime - Summary.md  
↓  
constraints.md  
↓  
05 - Validation Strategy - Summary.md  
↓  
04 - Implementation Agent - Summary.md  
↓  
validation-report.md

## Agent Responsibilities

Agents must:

- read artifacts from earlier workflow steps
- treat binding artifacts as authoritative
- reference artifacts when producing reasoning
- avoid ignoring earlier analysis
- escalate conflicts instead of silently overriding decisions
- update task control artifacts when milestone status changes
- keep one persistent per-task summary artifact per non-orchestrator specialist instead of creating duplicates
- follow the matching template from `docs/ai/templates/specialist-summaries/` when creating or refreshing a specialist summary artifact

## Conflict Handling

If artifacts conflict with each other:

1. Do not ignore the conflict.
2. Document the conflict in the current step.
3. Prefer constraints.md if conflict involves implementation scope.
4. Escalate the issue in the workflow output.

## Relationship with Repository Source of Truth

Repository code remains the ultimate source of truth.

Artifacts represent **analysis and constraints for a specific task**, not permanent documentation.

If artifacts contradict code behavior, agents must:

- report the discrepancy
- avoid silently changing behavior
- request clarification when necessary.

## Design Principles

Artifacts exist to ensure:

- deterministic workflow execution
- explicit decision chains
- low blast radius changes
- traceable reasoning
- safer AI-assisted development
