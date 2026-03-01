Is it a good idea to use PGLite in tests?

- Yes for integration, e2e.
- No for security checks or performance tests.

> So locally we have PGLite and on CI we have Testcontainers.
> This is the perfect compromise.
