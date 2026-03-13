#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EXIT_CODE=0
WARNINGS=0

print_section() {
  echo
  echo "== $1 =="
}

fail_matches() {
  local label="$1"
  local pattern="$2"
  shift 2
  local matches
  matches="$(rg -n "$pattern" "$@" || true)"

  if [[ -n "$matches" ]]; then
    echo "FAIL: $label"
    echo "$matches"
    EXIT_CODE=1
  else
    echo "PASS: $label"
  fi
}

warn_matches() {
  local label="$1"
  local pattern="$2"
  shift 2
  local matches
  matches="$(rg -n "$pattern" "$@" || true)"

  if [[ -n "$matches" ]]; then
    echo "WARN: $label"
    echo "$matches"
    WARNINGS=$((WARNINGS + 1))
  else
    echo "PASS: $label"
  fi
}

run_command_check() {
  local label="$1"
  shift
  if "$@"; then
    echo "PASS: $label"
  else
    echo "FAIL: $label"
    EXIT_CODE=1
  fi
}

run_optional_pnpm_check() {
  local label="$1"
  shift

  if [[ ! -d node_modules ]]; then
    echo "WARN: $label skipped (node_modules not installed)"
    WARNINGS=$((WARNINGS + 1))
    return 0
  fi

  run_command_check "$label" "$@"
}

warn_client_server_smells() {
  local server_pattern="$1"
  local matches=""
  local file

  while IFS= read -r file; do
    if rg -q "$server_pattern" "$file"; then
      matches+="${file}"$'\n'
    fi
  done < <(rg -l "^[\"']use client[\"']" src --glob '**/*.ts' --glob '**/*.tsx' || true)

  if [[ -n "$matches" ]]; then
    echo "WARN: client components importing obvious server-only modules"
    printf '%s' "$matches"
    WARNINGS=$((WARNINGS + 1))
  else
    echo "PASS: client components importing obvious server-only modules"
  fi
}

print_section "Architecture lint"

print_section "Layer dependency checks"

# src/core/runtime/bootstrap.ts and src/core/runtime/edge.ts are the
# Node and Edge composition root entry points (see docs/architecture/02).
# They intentionally import from modules to wire concrete implementations.
# src/core/container/** is the DI Container class — same exception.
fail_matches \
  "core must not import app/features/security/modules outside composition root" \
  "from '@/(app|features|security|modules)/" \
  src/core \
  --glob '!src/core/container/**' \
  --glob '!src/core/runtime/bootstrap.ts' \
  --glob '!src/core/runtime/edge.ts' \
  --glob '!**/*.test.*'

fail_matches \
  "shared must remain neutral" \
  "from '@/(app|features|modules|security)/" \
  src/shared \
  --glob '!**/*.test.*' \
  --glob '!**/*.mock.*'

fail_matches \
  "modules must not depend on app/features/security" \
  "from '@/(app|features|security)/" \
  src/modules \
  --glob '!**/*.test.*' \
  --glob '!**/*.mock.*'

fail_matches \
  "security must not directly depend on app/features/modules" \
  "from '@/(app|features|modules)/" \
  src/security \
  --glob '!**/*.test.*' \
  --glob '!**/*.mock.*'

print_section "Provider isolation checks"

# Clerk is intentionally allowed in:
# - src/modules/auth/**
# - src/proxy.ts
# - src/app/** delivery/UI integration boundaries
# - tests and src/testing/**
fail_matches \
  "Clerk must not leak into core/shared/security/authorization/features" \
  "@clerk/" \
  src/core \
  src/shared \
  src/security \
  src/features \
  src/modules/authorization \
  --glob '!**/*.test.*' \
  --glob '!**/*.mock.*'

print_section "Runtime smell checks"

warn_client_server_smells \
  "from '(next/headers|next/server|server-only|node:|fs|path|child_process)'|from \"(next/headers|next/server|server-only|node:|fs|path|child_process)\""

# proxy.ts and security middleware are edge-sensitive paths; obvious node-only imports are suspicious.
fail_matches \
  "edge-sensitive files must not import obvious node-only modules" \
  "from '(node:|fs|path|child_process|net|tls)'|from \"(node:|fs|path|child_process|net|tls)\"" \
  src/proxy.ts \
  src/security/middleware

print_section "Container usage review"

# Request-scoped createContainer() usage is intentional in this repository.
# Global container access in request-sensitive flows is still present in the current baseline,
# so this section warns instead of failing to keep arch:lint usable in day-to-day work.
warn_matches \
  "global container usage in request-sensitive flows requires review" \
  "container\.(resolve|register)(<[^>]+>)?\(" \
  src/app \
  src/modules/auth/ui \
  --glob '!**/*.test.*' \
  --glob '!**/*.mock.*' \
  --glob '!src/modules/auth/index.ts'

print_section "Dependency graph checks"
run_optional_pnpm_check "skott dependency graph check" pnpm skott:check:only
run_optional_pnpm_check "madge circular dependency check" pnpm madge

print_section "Summary"
if [[ "$WARNINGS" -gt 0 ]]; then
  echo "Warnings: $WARNINGS"
fi

if [[ "$EXIT_CODE" -ne 0 ]]; then
  echo "Architecture lint failed."
  exit "$EXIT_CODE"
fi

echo "Architecture lint passed."
