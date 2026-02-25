// src/modules/authorization/domain/permission.ts

/**
 * Atomic capability in the system.
 * Format: "<resource>:<action>"
 *
 * Examples:
 *  - "user:read"
 *  - "lesson:update"
 *  - "tenant:manage"
 */
export type Permission = `${string}:${string}`;

export type Action = Permission;

/**
 * Creates a normalized action token in "resource:verb" format.
 */
export function createAction(resource: string, verb: string): Action {
  const normalizedResource = resource.trim() || 'system';
  const normalizedVerb = verb.trim() || 'execute';

  return `${normalizedResource}:${normalizedVerb}`;
}

/**
 * Runtime guard for action tokens.
 */
export function isAction(value: string): value is Action {
  return /^[^:\s]+:[^:\s]+$/.test(value);
}

/**
 * Splits an action token into resource + verb.
 */
export function parseAction(action: Action): {
  resource: string;
  verb: string;
} {
  const [resource, verb] = action.split(':', 2);

  return {
    resource,
    verb,
  };
}
