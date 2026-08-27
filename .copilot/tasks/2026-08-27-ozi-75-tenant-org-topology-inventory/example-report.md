# OZI-75 — Example `scan` Report Shape

**Synthetic example only.** Every value below is invented for illustration.
This is what `pnpm tenancy-inventory:scan:dev` / `:scan:test` prints and
writes to `~/.local/share/nextjs-16-boilerplate/ozi-75/local/` — no real
environment data is reproduced here.

```json
{
  "tool": "tenancy-inventory",
  "toolVersion": "0.1.0",
  "environment": "local",
  "target": "dev",
  "targetDescriptor": "127.0.0.1:5432/app_dev",
  "commitSha": "0000000000000000000000000000000000000",
  "generatedAt": "2000-01-01T00:00:00.000Z",
  "readOnlyEnforced": true,
  "findings": {
    "tenantOrgCounts": {
      "zeroOrganizations": 2,
      "oneOrganization": 5,
      "multipleOrganizations": 1
    },
    "usersInMultipleOrgs": 1,
    "orgsMissingTenantAttributes": 0,
    "providerMappingAnomalies": {
      "organizationsWithoutProviderMapping": 3,
      "organizationsWithMultipleProviderMappings": 0
    },
    "waitlistEntriesWithTenantId": 0,
    "policiesWithNullOrganization": 0,
    "quotaSignal": {
      "tenantsExceedingMaxOrganizations": 1,
      "tenantsExceedingMaxUsers": 0
    },
    "tenantIdShape": {
      "featureFlags": { "nonNull": 0, "matchesInternalTenantUuid": 0 },
      "auditLogSettings": { "nonNull": 0, "matchesInternalTenantUuid": 0 },
      "auditEvents": { "nonNull": 12, "matchesInternalTenantUuid": 0 }
    }
  }
}
```

## Field notes

- Every field under `findings` is a `count()`/aggregate/bucket — no raw
  row, email, name, token, or UUID ever appears in this report. That's why
  it's safe to print in full to stdout and to write in full to the local
  evidence file; there's nothing left to redact.
- `matchesInternalTenantUuid: 0` alongside `nonNull > 0` means every
  populated `tenant_id` in that table is *not* shaped like (or does not
  resolve to) an internal `tenants.id` — consistent with the
  `TENANT_CONTEXT_SOURCE` ambiguity documented in `matrix.md`.
- `commitSha` and `generatedAt` are the actual run's values in a real
  report (git HEAD, current timestamp) — shown here as obvious placeholders.
