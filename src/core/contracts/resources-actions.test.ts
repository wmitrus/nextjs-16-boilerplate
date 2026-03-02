import { describe, expect, it } from 'vitest';

import { ACTIONS, RESOURCES, isAction } from './resources-actions';

describe('resources-actions catalog', () => {
  it('all RESOURCES values are non-empty strings', () => {
    for (const [key, value] of Object.entries(RESOURCES)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
      expect(value).not.toContain(' ');
      expect(value).toBe(value.toLowerCase());

      void key;
    }
  });

  it('all ACTIONS pass isAction() validation', () => {
    for (const [key, action] of Object.entries(ACTIONS)) {
      expect(
        isAction(action),
        `ACTIONS.${key} = "${action}" should pass isAction()`,
      ).toBe(true);

      void key;
    }
  });

  it('all ACTIONS are unique (no duplicates)', () => {
    const values = Object.values(ACTIONS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('no ACTIONS contain wildcard characters', () => {
    for (const [key, action] of Object.entries(ACTIONS)) {
      expect(action, `ACTIONS.${key} must not contain "*"`).not.toContain('*');

      void key;
    }
  });

  it('ACTIONS follow resource:verb naming convention', () => {
    for (const [key, action] of Object.entries(ACTIONS)) {
      expect(action, `ACTIONS.${key} must match resource:verb`).toMatch(
        /^[a-z_]+:[a-z_]+$/,
      );

      void key;
    }
  });

  it('PROVISIONING_ENSURE is defined and valid', () => {
    expect(ACTIONS.PROVISIONING_ENSURE).toBe('provisioning:ensure');
    expect(isAction(ACTIONS.PROVISIONING_ENSURE)).toBe(true);
  });

  it('ROUTE_ACCESS is defined and valid', () => {
    expect(ACTIONS.ROUTE_ACCESS).toBe('route:access');
    expect(isAction(ACTIONS.ROUTE_ACCESS)).toBe(true);
  });
});
