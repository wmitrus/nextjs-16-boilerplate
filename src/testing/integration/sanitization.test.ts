/** @vitest-environment node */
import { describe, it, expect } from 'vitest';

import { sanitizeData, toDTO } from '@/security/rsc/data-sanitizer';

describe('Data Sanitization Integration (RSC)', () => {
  it('should remove default blacklisted keys from a flat object', () => {
    const rawUser = {
      id: 'user_1',
      name: 'John Doe',
      password: 'super-secret-password',
      secretToken: 'abc-123',
      apiKey: 'key_999',
    };

    const sanitized = sanitizeData(rawUser);

    expect(sanitized).toEqual({
      id: 'user_1',
      name: 'John Doe',
    });
    expect(sanitized).not.toHaveProperty('password');
    expect(sanitized).not.toHaveProperty('secretToken');
    expect(sanitized).not.toHaveProperty('apiKey');
  });

  it('should recursively sanitize nested objects', () => {
    const complexData = {
      id: 1,
      metadata: {
        lastLogin: '2024-01-01',
        sessionToken: 'xyz-789',
        settings: {
          theme: 'dark',
          internalSecret: 'shhh',
        },
      },
    };

    const sanitized = sanitizeData(complexData);

    expect(sanitized.id).toBe(1);
    expect(sanitized.metadata.lastLogin).toBe('2024-01-01');
    expect(sanitized.metadata).not.toHaveProperty('sessionToken');
    expect(sanitized.metadata.settings.theme).toBe('dark');
    expect(sanitized.metadata.settings).not.toHaveProperty('internalSecret');
  });

  it('should sanitize all objects in an array', () => {
    const users = [
      { id: '1', name: 'User 1', password: 'p1' },
      { id: '2', name: 'User 2', password: 'p2' },
    ];

    const sanitized = sanitizeData(users);

    expect(sanitized).toHaveLength(2);
    expect(sanitized[0]).not.toHaveProperty('password');
    expect(sanitized[1]).not.toHaveProperty('password');
    expect(sanitized[0].name).toBe('User 1');
  });

  it('should support a custom blacklist', () => {
    const data = {
      publicField: 'hello',
      privateField: 'world',
      internalId: 'secret-123',
    };

    const sanitized = sanitizeData(data, ['private', 'internal']);

    expect(sanitized).toEqual({
      publicField: 'hello',
    });
  });

  it('should correctly pick fields using toDTO', () => {
    const user = {
      id: '1',
      email: 'john@example.com',
      isAdmin: true,
      internalNotes: 'VIP customer',
    };

    const dto = toDTO(user, ['id', 'email']);

    expect(dto).toEqual({
      id: '1',
      email: 'john@example.com',
    });
    // @ts-expect-error - testing property absence
    expect(dto.isAdmin).toBeUndefined();
    // @ts-expect-error - testing property absence
    expect(dto.internalNotes).toBeUndefined();
  });
});
