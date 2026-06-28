# Waitlist Email Flow — Current State vs Professional Standard

## Event Map

### 1. User Joins Waitlist (`POST /api/auth/waitlist`)

| Step                                   | Implemented? | Notes                                            |
| -------------------------------------- | ------------ | ------------------------------------------------ |
| Entry created in DB                    | ✅           |                                                  |
| Confirmation email sent                | ✅           | `sendWaitlistConfirmationEmail()` called         |
| Email sent only if provider configured | ⚠️           | `EMAIL_PROVIDER=none` → NoOp (console.info only) |
| Email content                          | ⚠️           | Basic — no position, no timeline expectations    |

**Professional standard**: Confirmation email should be sent immediately. Content should
acknowledge receipt, set expectations ("we'll review and notify you").

**Current implementation**: ✅ Done correctly — email IS sent. Only blocked by EMAIL_PROVIDER=none.

---

### 2. Admin Approves (`POST /api/admin/waitlist/[id]?action=approve`)

| Step                          | Implemented? | Notes                                                                                      |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| Entry marked `approved` in DB | ✅           |                                                                                            |
| Invitation record created     | ⚠️           | Only if `WAITLIST_INVITE_ORGANIZATION_ID` + `WAITLIST_INVITE_ROLE_ID` are set              |
| Invite email sent             | ⚠️           | Only if invitation was created                                                             |
| **Root gap**                  | ❌           | In `TENANCY_MODE=single`, org and role IDs are auto-generated — cannot be pre-set in env   |
| Email content                 | ⚠️           | Generic "You've been invited to join [org]" — not "Your waitlist application was approved" |

**Root cause of missing email**: `WAITLIST_INVITE_ORGANIZATION_ID` and `WAITLIST_INVITE_ROLE_ID`
are not set because in `TENANCY_MODE=single` the org ID is generated at first-user provisioning
time. You can't know it before deploying.

**Professional standard**:

1. Mark entry approved
2. Create invitation with secure token (72h expiry)
3. Send "Your application has been approved — click here to create your account" email
4. User clicks link → `/auth/invite/[token]` → sets password → provisioned as member

**Fix needed**: Auto-resolve org + member role from DB at approval time when env vars not set.

---

### 3. Admin Rejects (`POST /api/admin/waitlist/[id]?action=reject`)

| Step                          | Implemented? | Notes                                                           |
| ----------------------------- | ------------ | --------------------------------------------------------------- |
| Entry marked `rejected` in DB | ✅           |                                                                 |
| Rejection email sent          | ⚠️           | Only if `WAITLIST_SEND_REJECTION_EMAIL=true` (default: `false`) |
| Email content                 | ✅           | Polite, appropriate                                             |

**Professional standard**: Rejection email should be sent by default (transparency/UX best
practice). Most SaaS platforms notify on rejection. Opt-OUT (not opt-in) is more professional.

**Fix needed**: Change default of `WAITLIST_SEND_REJECTION_EMAIL` from `false` to `true`.
