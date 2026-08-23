import ipaddr from 'ipaddr.js';

/**
 * Which ingress sits in front of this deployment, and therefore which header
 * — if any — is allowed to determine the client IP.
 *
 * This is a *trust* setting, not a convenience one. A header is believed
 * because the operator declared the ingress that authoritatively sets it,
 * never because the header happens to be present: anyone can send
 * `x-forwarded-for`.
 */
export type DeploymentProxy =
  | 'vercel'
  | 'cloudflare'
  | 'trusted-proxy'
  | 'none';

/**
 * Why no client IP could be established. Kept as a closed union so callers
 * can distinguish "this deployment never has an IP" from "this one request
 * looked wrong", and so the reason can be logged without logging the header.
 */
export type UntrustedReason =
  | 'no-trust-model'
  | 'header-missing'
  | 'header-malformed'
  | 'header-too-long'
  | 'too-many-hops'
  | 'no-untrusted-hop';

/**
 * The result of resolving a client IP.
 *
 * A discriminated union rather than `string`, because the previous
 * `Promise<string>` had no way to say "I don't know" — so it said
 * `127.0.0.1`, and every caller treated that fiction as a fact. Rate limiting
 * bucketed every header-less client together under one loopback key, and the
 * audit log recorded a client address that never made the request.
 *
 * The type now forces each call site to decide what an unknown client means
 * for *it*: a shared fallback bucket for rate limiting, `null` for the audit
 * log. See SEC-43.
 */
export type ClientIp =
  | { readonly kind: 'trusted'; readonly ip: string }
  | { readonly kind: 'untrusted'; readonly reason: UntrustedReason };

/**
 * Caps on what will even be parsed. A header is attacker-controlled input on
 * every ingress, trusted or not, and the resolved value becomes a rate-limit
 * key and a database column downstream.
 */
const MAX_HEADER_LENGTH = 1024;
const MAX_FORWARDED_HOPS = 32;

function untrusted(reason: UntrustedReason): ClientIp {
  return { kind: 'untrusted', reason };
}

/**
 * Parses and canonicalises one address.
 *
 * Canonicalisation matters beyond tidiness: `::ffff:192.0.2.1`,
 * `::FFFF:192.0.2.1` and `192.0.2.1` are the same client, and without
 * normalisation each spelling would get its own rate-limit bucket — a
 * bypass that needs no more than a different way of writing the same
 * address. `ipaddr.js`'s `process()` unwraps IPv4-mapped IPv6 to IPv4, and
 * `toString()` emits the canonical form of whatever it returns.
 */
export function canonicalizeIp(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  // A bracketed IPv6 literal (`[::1]`) is valid in a URL authority but not to
  // the address parser.
  const unbracketed =
    trimmed.startsWith('[') && trimmed.endsWith(']')
      ? trimmed.slice(1, -1)
      : trimmed;

  // Deliberately stricter than `ipaddr.isValid`, which accepts short-form
  // IPv4 (`1.2.3` parses as `1.2.0.3`). A forwarding header carries a dotted
  // quad or an IPv6 literal; anything else is not an address this deployment
  // should reason about, and quietly expanding it would mean accepting input
  // no legitimate proxy emits.
  if (ipaddr.IPv4.isValidFourPartDecimal(unbracketed)) {
    return ipaddr.parse(unbracketed).toString();
  }
  if (ipaddr.IPv6.isValid(unbracketed)) {
    // `process()` unwraps IPv4-mapped IPv6 (`::ffff:192.0.2.1`) to IPv4, so
    // both spellings of one client collapse to a single key.
    return ipaddr.process(unbracketed).toString();
  }
  return null;
}

function readHeader(
  headers: Headers,
  name: string,
): string | null | 'too-long' {
  const raw = headers.get(name);
  if (raw === null) return null;
  if (raw.length > MAX_HEADER_LENGTH) return 'too-long';
  return raw;
}

/**
 * Resolves a single-value header that the ingress sets authoritatively and
 * overwrites — the shape both `cf-connecting-ip` and Vercel's own headers
 * have. Nothing is split: a comma in a header that should carry exactly one
 * address means something upstream is not what was declared.
 */
function fromAuthoritativeHeader(
  headers: Headers,
  names: readonly string[],
): ClientIp {
  for (const name of names) {
    const raw = readHeader(headers, name);
    if (raw === 'too-long') return untrusted('header-too-long');
    if (raw === null) continue;

    const canonical = canonicalizeIp(raw);
    if (canonical === null) return untrusted('header-malformed');
    return { kind: 'trusted', ip: canonical };
  }
  return untrusted('header-missing');
}

/**
 * Walks `X-Forwarded-For` right to left, discarding hops that belong to the
 * operator's own proxies, and returns the first address that does not.
 *
 * Right to left is the only order that resists forgery. The leftmost entry is
 * whatever the *client* sent, so a request arriving with
 * `X-Forwarded-For: 1.2.3.4` and passing through one real proxy becomes
 * `1.2.3.4, <real client>` — taking the leftmost hands the attacker any
 * address they like. Walking from the end discards only hops this deployment
 * actually owns and stops at the first one it does not.
 *
 * **This is the approach Express takes for `trust proxy`. RFC 7239 does not
 * define an algorithm for `X-Forwarded-For`** — it standardises the
 * `Forwarded` header, and its relevant point here is the general one: data in
 * a forwarding header is meaningful only once trust in the proxy is
 * established.
 *
 * ## What anchors the chain
 *
 * Express anchors it at the socket peer: it checks `remoteAddress` first and
 * only reads `X-Forwarded-For` if that hop is trusted. **Next.js does not
 * expose the peer** — `NextRequest` has no `ip` and no socket (`request.ip`
 * was removed in Next 15), in either runtime. So this implementation cannot
 * verify that the request actually arrived through the declared proxy.
 *
 * The anchor is therefore the operator's network topology, not a value this
 * code can check: `trusted-proxy` is sound only where the application is
 * unreachable except through that proxy. If the app can also be reached
 * directly, an attacker who does so controls the entire header and this mode
 * gives them any client IP they choose. That limitation is stated here rather
 * than papered over — see SEC-43.
 */
function fromForwardedChain(
  headers: Headers,
  trustedCidrs: readonly [ipaddr.IPv4 | ipaddr.IPv6, number][],
): ClientIp {
  const raw = readHeader(headers, 'x-forwarded-for');
  if (raw === 'too-long') return untrusted('header-too-long');
  if (raw === null) return untrusted('header-missing');

  const hops = raw.split(',');
  if (hops.length > MAX_FORWARDED_HOPS) return untrusted('too-many-hops');

  // Reversed copy plus `for...of` rather than an index walk: the linter reads
  // `hops[i]` as a dynamic object access (SEC-15/SEC-20), and iterating is
  // clearer about the intent anyway -- right to left, hop by hop.
  for (const hop of [...hops].reverse()) {
    const canonical = canonicalizeIp(hop);
    // A malformed hop is not skipped. Skipping would let an attacker insert
    // junk to shift which entry the walk lands on.
    if (canonical === null) return untrusted('header-malformed');

    const parsed = ipaddr.parse(canonical);
    const isOwnProxy = trustedCidrs.some(
      ([net, bits]) => parsed.kind() === net.kind() && parsed.match(net, bits),
    );
    if (!isOwnProxy) return { kind: 'trusted', ip: canonical };
  }

  // Every hop belongs to this deployment's own proxies, so the header never
  // recorded a client. Better to say so than to return a proxy's address as
  // if it were the caller.
  return untrusted('no-untrusted-hop');
}

export interface ClientIpResolverConfig {
  readonly proxy: DeploymentProxy;
  /** Required for `trusted-proxy`; ignored otherwise. */
  readonly trustedProxyCidrs?: readonly string[];
}

/**
 * Parses CIDR strings once, at construction, so a malformed entry surfaces at
 * startup instead of silently matching nothing on every request.
 */
function parseCidrs(
  cidrs: readonly string[],
): [ipaddr.IPv4 | ipaddr.IPv6, number][] {
  return cidrs.map((entry) => {
    const trimmed = entry.trim();
    try {
      return ipaddr.parseCIDR(trimmed);
    } catch {
      throw new Error(
        `[client-ip] TRUSTED_PROXY_CIDRS contains an invalid CIDR: "${trimmed}"`,
      );
    }
  });
}

/**
 * Builds the resolver for a declared deployment trust model (SEC-43).
 *
 * Provider-aware by construction: each mode reads only the header its
 * declared ingress sets authoritatively, and `none` reads none at all. There
 * is deliberately no "try them all" path — that was the old behaviour, and it
 * meant the effective trust model was whichever header an attacker chose to
 * send.
 */
export function createClientIpResolver(
  config: ClientIpResolverConfig,
): (headers: Headers) => ClientIp {
  switch (config.proxy) {
    case 'vercel':
      // Vercel overwrites these at its edge; a client-supplied copy cannot
      // survive to the function.
      return (headers) =>
        fromAuthoritativeHeader(headers, [
          'x-vercel-forwarded-for',
          'x-real-ip',
        ]);

    case 'cloudflare':
      // Cloudflare sets and overwrites `cf-connecting-ip`. `x-forwarded-for`
      // is deliberately not consulted: Cloudflare appends to whatever the
      // client sent, so its leftmost entry is attacker-controlled.
      return (headers) =>
        fromAuthoritativeHeader(headers, ['cf-connecting-ip']);

    case 'trusted-proxy': {
      const cidrs = parseCidrs(config.trustedProxyCidrs ?? []);
      if (cidrs.length === 0) {
        throw new Error(
          '[client-ip] DEPLOYMENT_PROXY=trusted-proxy requires TRUSTED_PROXY_CIDRS.',
        );
      }
      return (headers) => fromForwardedChain(headers, cidrs);
    }

    case 'none':
      // No declared ingress means no header can be believed. Every request is
      // untrusted, by design -- not a degraded state to be worked around.
      return () => untrusted('no-trust-model');
  }
}
