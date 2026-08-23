import { describe, expect, it } from 'vitest';

import { parseUuidRouteParam } from './uuid-route-param';

const VALID = '10000000-0000-4000-8000-000000000001';

describe('parseUuidRouteParam (SEC-23)', () => {
  it('accepts a well-formed UUID', () => {
    const result = parseUuidRouteParam({ id: VALID }, 'id');

    expect(result).toEqual({ ok: true, value: VALID });
  });

  it('rejects a malformed value without throwing', () => {
    const result = parseUuidRouteParam({ id: 'not-a-uuid' }, 'id');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.id).toEqual(['id must be a valid UUID']);
    }
  });

  it('rejects a missing segment', () => {
    const result = parseUuidRouteParam({}, 'id');

    expect(result.ok).toBe(false);
  });

  // A repeated segment is never a single UUID. Taking the first element would
  // honour a request shape the route never declared.
  it('rejects a repeated segment rather than taking the first value', () => {
    const result = parseUuidRouteParam({ id: [VALID, VALID] }, 'id');

    expect(result.ok).toBe(false);
  });

  it('reports errors under the segment name it was asked about', () => {
    const result = parseUuidRouteParam(
      { organizationId: 'nope' },
      'organizationId',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors)).toEqual(['organizationId']);
    }
  });

  // Postgres accepts these textually, so they must not be rejected as a
  // side effect of over-tightening the pattern.
  it('accepts uppercase UUIDs', () => {
    const result = parseUuidRouteParam({ id: VALID.toUpperCase() }, 'id');

    expect(result.ok).toBe(true);
  });
});
