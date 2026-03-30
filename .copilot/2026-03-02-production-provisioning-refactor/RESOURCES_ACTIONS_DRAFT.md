# Resources & Actions Draft (Production)

Status: `DRAFT`

## Tenancy mode assumptions

- `single`: jeden tenant domyślny (bez Clerk org context)
- `personal`: tenant per user
- `org`: tenant per Clerk organization

## Resources

- `route`
- `user`
- `tenant`
- `billing`
- `security`
- `provisioning`

## Actions (explicit only, no wildcard)

### Route

- `route:access`

### User

- `user:read`
- `user:update`
- `user:invite`
- `user:deactivate`

### Tenant

- `tenant:read`
- `tenant:update`
- `tenant:manage_members`

### Billing

- `billing:read`
- `billing:update`

### Security

- `security:read_audit`
- `security:manage_policies`

### Provisioning (internal/system)

- `provisioning:ensure`

> Note: `provisioning:ensure` traktujemy jako akcję internal/system do audytu i enforce w Node flow, nie jako standardową tenant user-facing permission.

## Suggested default role mappings (tenant-scoped)

## Clerk role mapping (source of truth)

- `org:admin` / `admin` -> `owner`
- `org:member` / `member` -> `member`
- missing/unknown claim -> fallback `member`

> Role claims są interpretowane wyłącznie w flow provisioningu; mapper identity pozostaje mechaniczny (external <-> internal).

### owner

- `route:access`
- `user:read`
- `user:update`
- `user:invite`
- `user:deactivate`
- `tenant:read`
- `tenant:update`
- `tenant:manage_members`
- `billing:read`
- `billing:update`
- `security:read_audit`
- `security:manage_policies`

### member

- `route:access`
- `user:read` (self)
- `user:update` (self)
- `tenant:read`
- `billing:read` (optional, zależnie od produktu)

## Guardrails

- Zabronione w defaultach: `resource='*'`, `actions=['*']`.
- Każda akcja musi istnieć na liście katalogowej.
- Policies tylko tenant-scoped (bez globalnych allow-all).
