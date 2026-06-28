# Plan — Admin AuthJS E2E Worker Root Cause

## Task ID

`2026-06-28-admin-authjs-e2e-worker-root-cause`

## Status

**COMPLETE**

## Goal

Produce hard evidence explaining why the focused AuthJS admin browser suite passes with `--workers=1` and fails with high parallelism, determine whether the current code has a realistic path to passing with `--workers=16`, and identify the true root cause rather than a guessed one.

## Steps

- [x] Step 1: Gather current failure and success evidence
- [x] Step 2: Compare controlled runs across worker counts
- [x] Step 3: Capture server-side or route-level evidence for the bottleneck
- [x] Step 4: Confirm the real root cause against code paths
- [x] Step 5: Assess realistic pass conditions for `--workers=8` and `--workers=16`
- [x] Step 6: Record conclusion and recommended next move
