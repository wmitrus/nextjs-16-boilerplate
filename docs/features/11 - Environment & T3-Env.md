# Environment & T3-Env

This project uses **@t3-oss/env-nextjs** with **Zod** to validate environment variables at runtime. The schema lives in `src/core/env.ts`.

---

## Quick Start

1. Create `.env.local` from the example:

```bash
pnpm env:init
```

2. Validate `.env.example` against the schema:

```bash
pnpm env:check
```

---

## How T3-Env Is Structured

`src/core/env.ts` defines three areas:

- **server**: server-only variables (never exposed to the client)
- **client**: public variables that must be prefixed with `NEXT_PUBLIC_`
- **runtimeEnv**: actual values read from `process.env`

Example (simplified):

```ts
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    CHROMATIC_PROJECT_TOKEN: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    CHROMATIC_PROJECT_TOKEN: process.env.CHROMATIC_PROJECT_TOKEN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
```

---

## Adding a New Environment Variable

1. Add it to the schema in `src/core/env.ts`:
   - Server-only: place in `server`
   - Client-exposed: place in `client` with `NEXT_PUBLIC_` prefix

2. Add the key to `.env.example` with a placeholder value.

3. Set the actual value in your local `.env.local`.

4. For CI/CD, add it in **GitHub → Settings → Secrets and variables → Actions**.

---

## Example: Chromatic Token

1. In `src/core/env.ts`:

- `CHROMATIC_PROJECT_TOKEN` is already defined under `server`.

2. Add to `.env.local`:

```
CHROMATIC_PROJECT_TOKEN=your_token_here
```

3. Add to GitHub Actions secrets:

- Name: `CHROMATIC_PROJECT_TOKEN`
- Value: your Chromatic project token

---

## Validation Rules

- `pnpm env:check` ensures **every key in `src/core/env.ts` exists in `.env.example`**.
- CI can fail if `.env.example` is missing keys.

---

## Tips

- Use `NEXT_PUBLIC_` prefix only when a variable must be available in the browser.
- Keep secrets out of `.env.example` (use placeholders instead).
- Update `.env.example` whenever you modify the schema.
