/**
 * Strict allowlist mapping from inbox hint fields to Linear create-issue
 * fields. Never forwards an arbitrary inbox value — an unrecognized hint is
 * simply omitted (no label/priority set), never passed through raw.
 */

const ALLOWED_TYPE_LABELS = new Set(['Bug', 'Feature', 'Improvement']);

const PRIORITY_MAP: Record<string, number> = {
  Urgent: 1,
  High: 2,
  Medium: 3,
  Low: 4,
};

/** `type:` hint → Linear label, only for the three canonical labels (Linear Task Operating Model §10). */
export function mapTypeHintToLabels(
  hint: string | undefined,
): string[] | undefined {
  if (hint !== undefined && ALLOWED_TYPE_LABELS.has(hint)) return [hint];
  return undefined;
}

/** `priority:` hint → Linear priority number, only for the four canonical names. */
export function mapPriorityHintToNumber(
  hint: string | undefined,
): number | undefined {
  if (
    hint !== undefined &&
    Object.prototype.hasOwnProperty.call(PRIORITY_MAP, hint)
  ) {
    return PRIORITY_MAP[hint];
  }
  return undefined;
}
