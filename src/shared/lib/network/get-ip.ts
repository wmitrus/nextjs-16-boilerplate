/**
 * Retrieves the client's IP address from the request headers.
 * Supports standard headers like 'x-forwarded-for' and 'cf-connecting-ip'.
 *
 * @param headers - The request headers (e.g., from next/headers)
 * @returns The client's IP address or '127.0.0.1' as a fallback.
 */
export async function getIP(headers: Headers): Promise<string> {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]!.trim();
  }

  const realIP = headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }

  const cfIP = headers.get('cf-connecting-ip');
  if (cfIP) {
    return cfIP.trim();
  }

  return '127.0.0.1';
}
