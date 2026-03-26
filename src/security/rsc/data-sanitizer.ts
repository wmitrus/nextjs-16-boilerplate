/**
 * Utility to sanitize data before sending it to the client from an RSC.
 * Prevents accidental leakage of sensitive fields (e.g., passwords, internal IDs).
 */
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
  const sanitized = Object.create(null) as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    if (blacklistedKeys.some((b) => key.toLowerCase().includes(b))) {
      continue;
    } else if (typeof source[key] === 'object' && source[key] !== null) {
      // eslint-disable-next-line security/detect-object-injection -- key is from Object.keys(source) (own props); sanitized uses Object.create(null); blacklisted keys already skipped
      sanitized[key] = sanitizeData(source[key], blacklistedKeys);
    } else {
      // eslint-disable-next-line security/detect-object-injection -- same as above
      sanitized[key] = source[key];
    }
  }

  return sanitized as unknown as T;
}

/**
 * DTO (Data Transfer Object) helper to ensure only specific fields are returned.
 */
export function toDTO<T, K extends keyof T>(
  data: T,
  allowedFields: K[],
): Pick<T, K> {
  const dto = Object.create(null) as Pick<T, K>;
  allowedFields.forEach((field) => {
    // eslint-disable-next-line security/detect-object-injection -- field is K extends keyof T (TypeScript-constrained); dto uses Object.create(null)
    dto[field] = data[field];
  });
  return dto;
}
