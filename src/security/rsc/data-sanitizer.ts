/**
 * Utility to sanitize data before sending it to the client from an RSC.
 * Prevents accidental leakage of sensitive fields (e.g., passwords, internal IDs).
 */
function isBlacklistedKey(key: string, blacklistedKeys: string[]): boolean {
  return blacklistedKeys.some((blockedKey) =>
    key.toLowerCase().includes(blockedKey),
  );
}

export function sanitizeData<T>(
  data: T,
  blacklistedKeys: string[] = ['password', 'secret', 'token', 'key'],
): T {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Handle Arrays
  if (Array.isArray(data)) {
    return data.map((item) =>
      sanitizeData(item, blacklistedKeys),
    ) as unknown as T;
  }

  // Handle Objects
  const source = data as Record<string, unknown>;
  const sanitizedEntries: Array<[string, unknown]> = [];

  for (const [key, value] of Object.entries(source)) {
    if (isBlacklistedKey(key, blacklistedKeys)) {
      continue;
    }

    sanitizedEntries.push([
      key,
      typeof value === 'object' && value !== null
        ? sanitizeData(value, blacklistedKeys)
        : value,
    ]);
  }

  return Object.fromEntries(sanitizedEntries) as T;
}

/**
 * DTO (Data Transfer Object) helper to ensure only specific fields are returned.
 */
export function toDTO<T, K extends keyof T>(
  data: T,
  allowedFields: K[],
): Pick<T, K> {
  const allowedFieldSet = new Set<PropertyKey>(
    allowedFields as readonly PropertyKey[],
  );

  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).filter(([key]) =>
      allowedFieldSet.has(key),
    ),
  ) as Pick<T, K>;
}
