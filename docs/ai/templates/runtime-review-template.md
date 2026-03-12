# Runtime Review

## Task

Short description of the runtime-sensitive change or investigation.

## Runtime Classification

Classify the runtime surface involved.

Possible categories:

- App Router
- server component
- client component
- route handler
- server action
- middleware / proxy
- caching / revalidation
- edge runtime
- node runtime
- env exposure
- unknown / requires investigation

Explain reasoning.

## Affected Runtime Surfaces

List affected runtime surfaces.

Examples:

- src/app/\*
- route handlers
- server actions
- middleware / proxy
- layouts
- pages
- client components

## Server vs Client Placement

Check whether logic is placed correctly.

Questions:

- should this run on the server?
- should this run on the client?
- is sensitive logic incorrectly in a client component?
- is browser-only logic incorrectly on the server?

Explain findings.

## Route Handlers / Server Actions

If relevant, check:

- where request handling happens
- where mutations happen
- whether validation is server-side
- whether runtime assumptions are explicit
- whether auth-sensitive behavior is handled safely

Explain findings.

## Middleware / Proxy Behavior

If relevant, check:

- matcher assumptions
- request classification
- header propagation
- whether middleware is being used as the only protection
- whether middleware behavior is runtime-safe

Explain findings.

## Caching / Revalidation

Check for:

- static vs dynamic assumptions
- user-specific caching risks
- tenant-specific caching risks
- incorrect revalidation assumptions
- cache leaks across users/tenants

Explain findings.

## Edge vs Node Runtime

Check for:

- node-only imports in edge-sensitive paths
- runtime-specific constraints
- accidental runtime switching
- imports that force the wrong runtime

Explain findings.

## Environment Exposure

Check whether non-public env vars could leak into client-executed code.

Explain findings.

## Runtime Constraints

List constraints implementation must respect.

Examples:

- keep sensitive logic server-side
- do not cache tenant-specific responses
- do not use node-only APIs in edge paths
- keep middleware responsibilities narrow

## Recommended Fix / Design Direction

Explain the safest minimal runtime-aware approach.

Focus on:

- correctness
- low blast radius
- predictable behavior in Next.js and Vercel

## Recommendation

Final decision:

- Safe to implement
- Safe with constraints
- Blocked pending deeper runtime review

Explain reasoning.
