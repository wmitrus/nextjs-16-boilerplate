Is it a good idea to use PGLite in tests?

- Yes for fast local DB tests.
- Prefer real Postgres (Testcontainers) in CI database profile.
- Do not use PGLite for performance/security parity checks.

> Recommended baseline: local speed with PGLite, CI confidence with real Postgres.
