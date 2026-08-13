# Intake

## Request

Investigate and correctly resolve the production Vercel prebuilt deploy failure. Preview deployment works. Production CI fails because the prebuilt upload validator reports `.env.example` as a forbidden traced file.

## Observed Failure

The production dry-run contains `.env.example`, referenced by generated `.vc-config.json` files. The repository validator rejects it as part of the `.env` forbidden prefix.

## Readiness

- [x] CI symptom captured.
- [x] Current workflow and upload profiles inspected.
- [x] Generated Vercel output inspected.
- [x] Candidate root cause tested.
- [x] Corrective change validated against the production prebuilt flow.
