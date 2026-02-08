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
  const sanitized = { ...data } as Record<string, unknown>;

  for (const key in sanitized) {
    if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
      if (blacklistedKeys.some((b) => key.toLowerCase().includes(b))) {
        delete sanitized[key];
      } else if (
        typeof sanitized[key] === 'object' &&
        sanitized[key] !== null
      ) {
        sanitized[key] = sanitizeData(sanitized[key], blacklistedKeys);
      }
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
  const dto = {} as Pick<T, K>;
  allowedFields.forEach((field) => {
    dto[field] = data[field];
  });
  return dto;
}
