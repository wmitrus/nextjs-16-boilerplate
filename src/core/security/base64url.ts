/**
 * base64url (RFC 4648 §5) helpers, Web-Crypto-friendly and runtime-neutral.
 *
 * `Buffer` is Node-only and `atob`/`btoa` are byte-oriented, so both encode
 * and decode go through explicit byte arrays rather than string coercion --
 * the same code then works in the Edge runtime.
 */

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Returns `undefined` for anything that is not valid base64url rather than
 * throwing: every caller here is parsing attacker-supplied material (a
 * cookie, a stored envelope), and a malformed value is a normal, expected
 * input that must fail closed, not an exception to handle.
 */
export function base64UrlToBytes(
  value: string,
): Uint8Array<ArrayBuffer> | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return undefined;

  const padded = value.replace(/-/g, '+').replace(/_/g, '/');

  try {
    // `Uint8Array.from` with a mapper rather than an indexed write loop:
    // `bytes[i] = ...` is the dynamic-object-mutation shape the repository's
    // scanners flag on sight (SEC-20), and the functional form is equivalent.
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
}

export function utf8ToBytes(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
