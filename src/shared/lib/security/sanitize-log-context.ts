const SECRET_KEY_PATTERN =
  /^(password|secret|token|authorization|cookie|key|apikey|api_key|auth|credential)$/i;

const RESERVED_TOP_LEVEL_FIELDS = new Set([
  'type',
  'category',
  'module',
  'source',
]);

const MAX_STRING_LENGTH = 2048;
const MAX_CONTEXT_DEPTH = 3;

export function sanitizeLogContext(
  obj: Record<string, unknown>,
  depth = 0,
  trusted = false,
): Record<string, unknown> {
  if (depth >= MAX_CONTEXT_DEPTH) return {};

  const result: Record<string, unknown> = Object.create(null);

  for (const [key, value] of Object.entries(obj)) {
    if (depth === 0 && key === 'source') continue;
    if (depth === 0 && !trusted && RESERVED_TOP_LEVEL_FIELDS.has(key)) continue;
    if (SECRET_KEY_PATTERN.test(key)) continue;

    if (typeof value === 'string') {
      // eslint-disable-next-line security/detect-object-injection -- result uses Object.create(null); key is from Object.entries (own props only); secret keys already filtered above
      result[key] =
        value.length > MAX_STRING_LENGTH
          ? `${value.slice(0, MAX_STRING_LENGTH)}[truncated]`
          : value;
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      // eslint-disable-next-line security/detect-object-injection -- same as above
      result[key] = value;
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      // eslint-disable-next-line security/detect-object-injection -- same as above
      result[key] = sanitizeLogContext(
        value as Record<string, unknown>,
        depth + 1,
        trusted,
      );
    } else if (Array.isArray(value)) {
      // eslint-disable-next-line security/detect-object-injection -- same as above
      result[key] = value
        .slice(0, 10)
        .map((v) =>
          typeof v === 'string' && v.length > MAX_STRING_LENGTH
            ? `${v.slice(0, MAX_STRING_LENGTH)}[truncated]`
            : v,
        )
        .filter(
          (v) =>
            typeof v === 'string' ||
            typeof v === 'number' ||
            typeof v === 'boolean' ||
            v === null,
        );
    }
  }

  return result;
}
