# Remaining Browser Errors Classification

## 1. Objective

Classify the remaining browser-side errors after the Clerk redirect normalization fix, identify the strongest remaining blocker for the sign-up/auth flow, and determine whether the next action belongs in repository code or at an external integration/runtime boundary.

Assumption: the previously observed `TypeError: Invalid URL` is now resolved, and the current user-visible failure is a sign-up flow stall or failure rather than a later `/users` redirect loop.

## 2. Current-State Findings

- The repository-owned Clerk redirect inputs are now normalized to absolute same-origin URLs before reaching Clerk in both the provider and modal button surfaces:
  - `src/app/layout.tsx:49-84`
  - `src/modules/auth/ui/HeaderAuthControls.tsx:18-66`
- The sign-up page itself does not implement a custom challenge flow. It mounts Clerk's hosted UI directly:
  - `src/app/sign-up/[[...sign-up]]/sign-up-client.tsx:21`
- The repository does not directly render or validate Turnstile. The only Cloudflare-specific repository code found is CSP allowlisting for `https://challenges.cloudflare.com`:
  - `src/security/middleware/with-headers.ts:62-112`
- Browser log ingestion and Sentry instrumentation are observational, not auth-control logic:
  - `src/shared/components/error/global-error-handlers.tsx:29-205`
  - `src/instrumentation-client.ts:11-30`
  - `src/app/api/logs/route.ts:134-204`
- Prior session notes already separated Cloudflare iframe CSP noise from the earlier redirect problem and treated CSS parser issues as library/browser noise rather than a provisioning/bootstrap blocker.

## 3. Architectural Assessment

- Redirect normalization is repository-owned and appears correctly isolated at the Clerk integration boundary.
- The sign-up experience itself is Clerk-owned UI running in the browser.
- The challenge widget on that path is Cloudflare Turnstile, embedded by Clerk, and therefore sits outside repository ownership.
- Browser/Sentry/logging code can surface or duplicate errors, but it does not decide whether a Clerk sign-up can complete.

## 4. Classification Of Remaining Errors

| Error / Symptom                                                                   | Classification                                                      | Strongest Likely Origin                                                             | Flow Impact                                                                        | Assessment                                                                                                                                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Failed to parse the rule '.cl-internal-...:focus::-moz-focus-inner{border:0;}'`  | Likely harmless noise                                               | Clerk-injected CSS using deprecated vendor-specific selector syntax                 | Not flow-breaking                                                                  | This is a stylesheet parse warning, not an auth-state or challenge-state failure. It may affect a tiny styling edge case, but it does not explain a hung sign-up flow.   |
| Other Clerk CSS parser warnings such as `::-moz-placeholder` / `color-mix(...)`   | Likely harmless noise                                               | Clerk stylesheet plus browser CSS parser compatibility                              | Not flow-breaking                                                                  | Same class as above: parser/style compatibility noise, not a trust-boundary or redirect failure.                                                                         |
| Console warnings from `challenges.cloudflare.com` or iframe CSP/security messages | Likely third-party runtime warnings                                 | Cloudflare iframe runtime                                                           | Usually not flow-breaking by themselves                                            | Prior evidence already showed some Cloudflare iframe console messages are normal/noisy and not proof of a broken auth flow.                                              |
| `Turnstile Widget seem to have hung`                                              | Likely flow-breaking                                                | Cloudflare Turnstile challenge execution path, surfaced through Clerk sign-up       | Flow-breaking                                                                      | This directly indicates the challenge did not complete. Since Turnstile is on the critical path for Clerk sign-up, a hung widget can block form completion.              |
| `Error 300030`                                                                    | Likely flow-breaking                                                | Cloudflare Turnstile generic challenge failure                                      | Flow-breaking                                                                      | Cloudflare documents `300*` as generic challenge failure. That is now the strongest remaining blocker signal.                                                            |
| `TypeError: Cyclic __proto__ value`                                               | Likely third-party runtime error that may contribute to the blocker | Browser JS runtime executing external challenge code                                | Potentially flow-breaking when co-occurring with widget hang, but likely secondary | The repo does not implement prototype mutation in this auth surface. This looks like an exception thrown inside third-party browser code, not repository business logic. |
| `TypeError: invalid_argument at new DisplayNames(...)`                            | Likely third-party runtime error that may contribute to the blocker | Browser `Intl.DisplayNames` runtime invoked by external challenge/localization code | Potentially flow-breaking when co-occurring with widget hang, but likely secondary | The repo does not use `Intl.DisplayNames` in its sign-up/auth code. This looks like external challenge/localization code tripping a browser/runtime condition.           |
| Sentry/browser instrumentation noise                                              | Likely harmless noise                                               | Repository observability                                                            | Not flow-breaking                                                                  | Instrumentation may capture, duplicate, or miss some errors, but it is not the cause of the auth failure.                                                                |

### Requested separation

Likely harmless noise:

- Clerk CSS rule parse errors involving `::-moz-focus-inner`
- similar Clerk CSS parser warnings
- Sentry/browser instrumentation chatter

Likely third-party runtime warnings:

- Cloudflare iframe CSP/security warnings by themselves
- `TypeError: Cyclic __proto__ value`
- `TypeError: invalid_argument at new DisplayNames(...)`

Likely flow-breaking errors:

- `Turnstile Widget seem to have hung`
- `Error 300030`

## 5. Clerk CSS Error Assessment

### Question

Are the Clerk CSS errors flow-breaking or only noisy?

### Answer

They are most likely only noisy.

Why:

- The failing selector is style-parser related, not auth-state related.
- `::-moz-focus-inner` is a deprecated non-standard Mozilla pseudo-element. A parser warning around it points to CSS compatibility debt, not redirect/session corruption.
- There is no repository code path where these CSS warnings would prevent Clerk from issuing a session or Turnstile from completing.
- The current remaining visible blocker symptoms are challenge-timeout/failure symptoms, not "Clerk never mounted" or "sign-up UI failed to render" symptoms.

Conclusion:

- Treat the `::-moz-focus-inner` parse failures as non-blocking third-party style noise unless a future reproduction shows the entire Clerk UI fails to mount or input focus becomes unusable. Based on current evidence, they should not be the next fix target.

## 6. Cloudflare / Turnstile Error Assessment

### Question

Are the Turnstile errors now the strongest blocker?

### Answer

Yes. Based on the confirmed removal of the old `Invalid URL` failure and the current remaining error set, the strongest remaining blocker candidate is now Turnstile/challenge failure, not Clerk redirect handling.

Most important signals:

- `Turnstile Widget seem to have hung`
- `Error 300030`

Supporting interpretation:

- Cloudflare documents `300*` as a generic challenge failure family with retry behavior.
- Cloudflare also documents that challenge failures can be caused by browser compatibility, extensions/content blockers, JavaScript blocking, unstable network, VPN/proxy interference, or other environment signals.
- Turnstile exists specifically to gate sensitive actions like sign-up until the challenge succeeds, so a hung/failing widget can block the Clerk flow even when redirects are now correct.

## 7. Origin Analysis Of The Challenge Errors

### Inside the Cloudflare iframe only

Most likely:

- `Turnstile Widget seem to have hung`
- `Error 300030`
- `challenges.cloudflare.com` CSP/security/runtime console output

Reason:

- The repository does not render a first-party Turnstile widget or own a first-party Turnstile callback path.
- The only first-party Cloudflare-related code is CSP allowlisting.
- Turnstile runtime execution happens in Cloudflare-controlled assets/iframes embedded via Clerk.

### Inside Clerk integration/runtime

Secondarily possible:

- Clerk may surface or react to a failed challenge because Clerk is the UI host that embeds Turnstile.
- If an error appears in a Clerk bundle rather than `challenges.cloudflare.com`, that is more likely Clerk reacting to a failed challenge or bridging data from the iframe than repository code causing the failure.

### Inside repository code

No strong evidence.

Reasons:

- Redirect props are normalized before reaching Clerk.
- The sign-up client is just `<SignUp path="/sign-up" />`.
- There is no repository-owned Turnstile render, no error callback, no explicit token handling, and no `Intl.DisplayNames` usage in the auth surface.
- There is no repository-owned code path here that plausibly explains `Cyclic __proto__ value` or `new DisplayNames(...)`.

### Browser/runtime/environment conditions

Strong contributing-factor candidate.

This is the most plausible explanation for:

- `TypeError: Cyclic __proto__ value`
- `TypeError: invalid_argument at new DisplayNames(...)`

Those look like native browser/runtime exceptions triggered while external challenge code is running. That points to an issue at the browser + third-party script boundary, not a repository business-rule bug.

## 8. Strongest Remaining Root Cause Candidate

The strongest remaining root cause candidate is:

**Cloudflare Turnstile challenge execution failure inside the Clerk-rendered sign-up flow, likely in the external `challenges.cloudflare.com` runtime path, with `300030` and widget-hung symptoms representing the actual flow blocker.**

More precise ownership statement:

- Primary failing path: third-party/runtime-owned
- Integration surface: Clerk-hosted sign-up UI
- Repository-owned blocker: not currently indicated

Interpretation of the two extra runtime exceptions:

- `TypeError: Cyclic __proto__ value`
- `TypeError: invalid_argument at new DisplayNames(...)`

These are best treated as likely secondary manifestations of the same failing challenge path, not as separate repository-owned bugs.

## 9. Is The Current User-Visible Failure Now Turnstile-Driven?

Yes, that is now the most likely interpretation.

Why:

- The previously dominant redirect bug has been explicitly reported as resolved.
- The remaining visible error cluster is challenge-specific, not redirect-specific.
- Turnstile sits before successful sign-up completion.
- No repository-owned post-auth route or server-side guard issue currently explains the reported hanging widget and `300030`.

Therefore:

- The current failing user-visible behavior is now more likely caused primarily by Turnstile/challenge failure than by Clerk redirect handling.

## 10. Minimum Safe Next Step

Do not change redirect/bootstrap/auth-routing code again.

The minimum safe next step is an ownership-and-environment check focused on the challenge boundary:

1. Reproduce the sign-up flow in a clean supported browser profile with extensions disabled.
2. Reproduce again on a different network or device.
3. Capture the exact source URL/frame context for:
   - `300030`
   - `Turnstile Widget seem to have hung`
   - `Cyclic __proto__ value`
   - `invalid_argument at new DisplayNames(...)`
4. Capture the Turnstile Ray ID or feedback identifier if the widget exposes one.
5. Confirm whether the same failure occurs on both:
   - the dedicated `/sign-up` page
   - the modal `SignUpButton` flow

If that check still reproduces:

- The next escalation target should be Clerk/Cloudflare support or Clerk dashboard-side bot-protection validation, not repository auth logic.

## 11. Should Implementation Proceed Directly?

No.

One more architecture/ownership check is needed first.

Reason:

- The strongest blocker is no longer on a repository-owned path with a clear safe code fix.
- Implementing another repo change without first proving repository ownership risks creating churn around the wrong boundary.

If a repo change is needed after that check, the minimum safe implementation target should be:

- better boundary diagnostics around Clerk sign-up / challenge failure attribution, or
- user-facing fallback/error messaging for challenge failure,

not another redirect or bootstrap refactor.

## 12. Validation / Verification

This classification is based on:

- repository inspection of the current Clerk, CSP, sign-up, logging, and Sentry integration code
- prior session artifacts documenting the old `Invalid URL` failure and Cloudflare iframe noise
- official Cloudflare and MDN references for Turnstile error classes and browser/runtime error semantics

This session did not produce a fresh live browser trace because:

- no running Next.js MCP dev server was discoverable in this sandbox session
- Cloudflare documents that unsupported/headless automation environments are not a reliable Turnstile verification path

That limitation does not materially weaken the ownership conclusion, but it does justify doing one clean environment verification before changing repository code again.

## 13. Final Requested Outputs

### 1. Classification of all remaining errors

- Clerk CSS parse errors: likely harmless noise
- Cloudflare iframe CSP/security warnings: likely third-party runtime warnings
- `Turnstile Widget seem to have hung`: likely flow-breaking
- `Error 300030`: likely flow-breaking
- `TypeError: Cyclic __proto__ value`: likely third-party runtime error, probably secondary to the challenge failure
- `TypeError: invalid_argument at new DisplayNames(...)`: likely third-party runtime/browser-locale error, probably secondary to the challenge failure
- possible Sentry/browser instrumentation noise: likely harmless noise

### 2. Exact strongest remaining root cause candidate

Cloudflare Turnstile challenge execution failure in the Clerk sign-up flow, most concretely represented by the widget hang plus `300030`.

### 3. Whether the blocker is repository-owned or third-party/runtime-owned

Primarily third-party/runtime-owned at the Clerk/Cloudflare/browser boundary, not currently repository-owned.

### 4. Minimum safe next step

Run one focused ownership/environment verification on the Turnstile boundary before changing code, and escalate to Clerk/Cloudflare if the failure reproduces cleanly.

### 5. Whether implementation should proceed directly or one more architecture check is needed

One more architecture/ownership check is needed first. Direct implementation in repository code is not yet justified.

## Sources

- Cloudflare Turnstile client-side errors:
  - https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/
- Cloudflare Turnstile error codes:
  - https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
- Cloudflare challenge solve issues:
  - https://developers.cloudflare.com/turnstile/troubleshooting/challenge-solve-issues/
- Cloudflare supported browser/runtime caveats:
  - https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/
- MDN `::-moz-focus-inner`:
  - https://developer.mozilla.org/en-US/docs/Web/CSS/::-moz-focus-inner
- MDN cyclic prototype error:
  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_prototype
- MDN `Intl.DisplayNames()` constructor:
  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames/DisplayNames
