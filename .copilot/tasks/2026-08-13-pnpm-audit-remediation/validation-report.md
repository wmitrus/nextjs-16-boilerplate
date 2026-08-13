# Validation Report

## Commands

```shell
pnpm install --lockfile-only
pnpm audit
pnpm audit --prod
```

## Results

- Lockfile regeneration succeeded.
- Full audit exits successfully. Its only reported findings are two high
  `image-size` advisories explicitly ignored by GHSA because the required
  `2.0.3` package version is not published.
- Production audit reports zero known vulnerabilities.

## Residual Risk

`image-size` is dev-only and used by the Storybook Next.js plugin. The parser
denial-of-service findings remain upstream-blocked. The exceptions must be
removed when a published fixed version or compatible parent update is available.
