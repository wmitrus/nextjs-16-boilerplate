# CI/CD Evidence Retrieval

## Purpose

This document is the neutral cross-tool authority for retrieving and evaluating
CI, pull-request check, GitHub Actions, artifact, and deployment evidence for
this repository.

Use it during CI status checks, deployment diagnosis, debug investigations,
incident workflows, and change validation. Do not load it for unrelated work.

The objective is diagnostic correctness with minimal context consumption and a
reliable escalation path to authoritative raw evidence.

## Core Retrieval Rules

### 1. Start With Metadata

After a push or pull request, retrieve runs, checks, conclusions, jobs, steps,
IDs, and artifact metadata first.

If every required check and job succeeded, stop. Do not retrieve logs merely to
confirm a successful status.

### 2. Retrieve Logs For Materially Non-Successful States

By default, retrieve log evidence only for jobs or checks in materially
non-successful terminal states. This includes:

- `failure`;
- `timed_out`;
- `cancelled`;
- `action_required`;
- `startup_failure`;
- `stale`;
- any other state that fails a required check or workflow.

Do not retrieve genuinely successful job logs except for the narrow dependency
case described under Successful-Job Evidence.

### 3. Keep Full Job Logs Out Of Model Context By Default

Do not send an entire multi-thousand-line job log directly through a connector
or API into model context when the retrieval path cannot limit or paginate the
content.

Download the raw log to a local temporary file first, then use targeted search
and focused reads to locate the failed step and primary error. Suitable
retrieval paths include `gh run view --log` and the GitHub Actions raw job-log
download endpoint through `gh api`.

Do not assume `gh run view --log` is sufficient. It has returned empty output
for existing logs in this repository. If it fails or returns nothing, use the
direct job-log download endpoint.

The local raw file remains the authoritative fallback. Load the complete log
into context only when targeted extraction cannot establish a reliable result.

### 4. Use A Focused First-Pass Budget

Aim for approximately 100 relevant lines of log content in the first diagnostic
pass. This budget applies to content entering model context, not to:

- metadata calls;
- the amount of data scanned locally;
- the size of the local raw-log file;
- the final excerpt shown to the user.

Targeted commands may scan the full local file, but their output should contain
only line locations and short signatures until the causal region is known.

The budget is an orientation target, not a security boundary. A modest overrun
is acceptable when necessary to locate the failure correctly. Avoid repeated
or overlapping reads of the same content.

### 5. Anchor On The Cause, Not The Terminal Exit Marker

Do not anchor the first excerpt solely on the final
`##[error]Process completed with exit code ...` marker or the final lines of the
job. Those usually describe only the terminal symptom.

Locate evidence in this order:

1. the failed-step boundary;
2. the first material error, exception, assertion, or fatal signature in that
   step;
3. the causal stack or server error associated with that signature;
4. the exit code or `##[error]` marker as a secondary anchor.

If several signatures exist, classify them into distinct failure clusters
before selecting excerpts.

A useful initial excerpt normally contains:

- approximately 20 lines before the causal signature;
- the complete relevant error or stack block;
- approximately 20 lines after it.

### 6. Deduplicate Retries Without Losing Distinct Failures

When a runner such as Playwright repeats the same failure, retain one
representative stack trace and report the retry count. Preserve every materially
different failure cluster.

### 7. Expand Selectively

If the first focused excerpt does not establish root cause, expand by roughly
100–200 lines around the correct location when:

- the excerpt is ambiguous;
- it contains only a symptom;
- earlier causal context is missing;
- several failure clusters overlap;
- the conclusion would otherwise depend on an assumption.

Expand from the already downloaded raw file. Do not repeatedly fetch the same
log through a connector, and do not jump directly to the entire log.

## Successful-Job Evidence

Read evidence from an earlier successful job only when a non-successful job's
root cause depends on an artifact, state, or output produced by that successful
job and the evidence is unavailable elsewhere.

Retrieve only the relevant fragment using the same local-file and targeted
extraction process. Do not load the successful job's complete log
automatically.

## Raw Evidence Escalation

Treat the locally retrieved full job log as authoritative. Escalate to the
required larger raw evidence block, or the full log, when:

- the failure location remains uncertain;
- the focused excerpt is contradictory or incomplete;
- an exact stack, timestamp, request ID, path, or test name is needed;
- the cause may occur substantially before the terminal failure;
- several distinct failures cannot be separated safely;
- the agent is about to sign off on a root cause and truncation could change
  the conclusion.

Targeted retrieval is a context-efficiency technique, not permission to omit
evidence required for correctness.

## High-Risk Conclusions

For security, authentication, authorization, production deployment, production
Vercel failures, migrations, SQL, persistence, tenant isolation, secrets, or
environment configuration, a truncated excerpt may route and begin the
investigation but must not be the sole basis for a final conclusion when omitted
context could matter.

Retrieve the exact raw evidence block or full raw source needed to support the
conclusion.

## Evidence Layer Ownership

Use each evidence layer for its intended purpose:

- GitHub connector or API: run, check, job, step, and artifact metadata;
- local raw-log download plus targeted extraction: job-log content;
- local artifact download plus targeted extraction: workflow-run artifacts;
- observability providers: narrowly correlated runtime and deployment evidence;
- local shell compression tools: first-pass compression for local command
  output, not authority for remote CI or deployment logs.

Do not install a global RTK hook and do not run `rtk init -g`.

Compressed output is discovery evidence. Raw output remains the fallback when
compression omits information needed for the conclusion.

## Evidence Escalation Ladder

Use the lightest evidence layer that can answer the question correctly:

1. non-success job metadata and a targeted log excerpt;
2. run or job artifact metadata, followed by targeted extraction from relevant
   artifact content;
3. observability evidence correlated by timestamp, route, request, deployment,
   trace, or another available identifier;
4. full or raw evidence from the relevant layer when narrower evidence is
   insufficient, contradictory, or materially truncated.

This order is a default, not a mandatory sequence. Skip an irrelevant layer
when metadata or existing evidence justifies doing so, and record the reason in
the investigation notes.

Do not load complete archives, reports, traces, dashboards, or log streams when
a targeted read is sufficient.

## Reporting Requirements

When the analysis uses a truncated excerpt:

- identify the workflow, job, and step;
- state explicitly that the excerpt is truncated;
- state that the complete raw log is available as fallback;
- do not present the excerpt as the complete log;
- distinguish confirmed evidence, hypotheses, and conclusions;
- report unresolved ambiguity or missing evidence.

When several failure clusters exist, report each material cluster separately.
Do not collapse distinct causes into a single terminal exit-code finding.

## Repository Baseline

Many confirmed root causes in this repository fit within approximately 8–12
lines. More complex Playwright failures have required approximately 40–80
lines, while full job logs often contain thousands of lines of setup, install,
build, and retry noise.

The approximately 100-line first-pass target is deliberately conservative. It
is neither a hard cap nor a security control.
