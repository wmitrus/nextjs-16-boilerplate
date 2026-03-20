# AUTH FLOW VERIFICATION RUN TEMPLATE

## Verification Run Metadata

- Date:
- Tester:
- Branch / commit:
- Environment:
- Runtime mode:
- DB provider / driver:
- Clerk redirect target:
- App URL:
- Notes before run:

---

## Preconditions

- [ ] Correct env is loaded
- [ ] Correct DB is running
- [ ] Migrations are applied
- [ ] Test accounts are prepared
- [ ] Browser DevTools open
- [ ] Server logs visible
- [ ] No stale cookies/session state that would invalidate the run

---

## Accounts Used

### Account A — Fresh User

- Purpose: new sign-up / onboarding required
- Email / identifier:
- Expected initial state:
- Notes:

### Account B — Onboarded User

- Purpose: returning user direct access to `/users`
- Email / identifier:
- Expected initial state:
- Notes:

### Account C — Incomplete User

- Purpose: returning user forced to `/onboarding`
- Email / identifier:
- Expected initial state: reusable Clerk identity only; app-side onboarding-incomplete state is created during this run
- Notes: do not rely on a permanently preserved incomplete DB state across runs

---

## Scenario Results

### AF-01 — New user sign-up

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes:

### AF-02 — New user requiring onboarding

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes:

### AF-03 — New user onboarding submit

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes:

### AF-04 — Post-onboarding landing

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes:

### AF-05 — Returning onboarded user sign-in

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes:

### AF-06 — Returning not-yet-onboarded user sign-in

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes: if rerunnable, document how the incomplete state was created in-run before the returning sign-in check

### AF-07 — Direct visit to `/users` before onboarding completion

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes:

### AF-08 — Direct visit to `/users` after onboarding completion

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes:

### AF-09 — Direct visit to `/onboarding` after onboarding completion

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes:

### AF-12 — Middleware onboarding signal read

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Key evidence:
- Notes:

### AF-13 — Cookie set legality

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Key evidence:
- Notes:

### AF-14 — Cookie clear legality

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Key evidence:
- Notes:

### AF-15 — Cookie does not become source of truth

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Key evidence:
- Notes:

### AF-16 — Users layout safety net

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Key evidence:
- Notes:

### AF-17 — Root layout stability

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Key evidence:
- Notes:

### AF-18 — Clerk provider branch stability

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Key evidence:
- Notes:

### AF-21 — `/users -> /onboarding` race regression

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Key evidence:
- Notes:

### AF-22 — Sign-out then sign-in again

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes:

### AF-23 — Refresh on `/users`

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes:

### AF-24 — Refresh on `/onboarding`

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes:

### AF-25 — Hostile `redirect_url` sanitization

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Key evidence:
- Notes:

### AF-26 — Unauthenticated access to private route

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes:

### AF-27 — Auth route access while already signed in

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Final URL:
- Key evidence:
- Notes:

### AF-28 — Log observability

- Status: PASS / FAIL / DEFERRED / BLOCKED
- Steps performed:
- Expected result:
- Actual result:
- Key evidence:
- Notes:

---

## Critical Runtime Signals Collected

### Server-side

- users_guard:decision:
- onboarding_guard:decision:
- provisioning:ensure:\*:
- bootstrap/start route outcome:
- cookie set/clear evidence:
- unexpected errors:

### Browser-side

- final committed pathname:
- onboarding hydrated marker:
- onboarding form mount evidence:
- browser console errors:
- network anomalies:

### Cookie State

- `__onboarding_pending` set when expected: YES / NO
- `__onboarding_pending` cleared when expected: YES / NO
- Notes:

---

## Summary of This Run

### Passed Scenarios

-

### Failed Scenarios

-

### Deferred / Blocked Scenarios

-

### Regression Risk Assessment

- Low / Medium / High

### Overall Result

- VERIFIED
- PARTIALLY VERIFIED
- NOT VERIFIED

### Follow-up Actions

-
