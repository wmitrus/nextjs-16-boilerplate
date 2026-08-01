const REPLAY_TOKEN_SEPARATOR = '|';

function createReplayNonce(): string {
  const cryptoApi = globalThis.crypto;

  if (!cryptoApi) {
    throw new Error('Replay token generation requires Web Crypto');
  }

  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);

  // RFC 4122 v4 UUID bit layout for runtimes with getRandomValues but no randomUUID.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export function createReplayToken(): string {
  return `${Date.now()}${REPLAY_TOKEN_SEPARATOR}${createReplayNonce()}`;
}
