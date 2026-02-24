import { describe, it, expect } from 'vitest';

import { sanitizeData, toDTO } from './data-sanitizer';

describe('Data Sanitizer', () => {
  describe('sanitizeData', () => {
    it('should remove blacklisted keys', () => {
      const data = {
        id: 1,
        username: 'john',
        password: 'secure123',
        api_key: 'abc-def',
      };
      const result = sanitizeData(data);
      expect(result).toEqual({ id: 1, username: 'john' });
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          name: 'jane',
          token: 'xyz',
        },
        meta: 'data',
      };
      const result = sanitizeData(data);
      expect(result).toEqual({
        user: { name: 'jane' },
        meta: 'data',
      });
    });

    it('should handle arrays', () => {
      const data = [
        { id: 1, secret: 'a' },
        { id: 2, secret: 'b' },
      ];
      const result = sanitizeData(data);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should allow custom blacklist', () => {
      const data = { name: 'test', internalId: '123' };
      const result = sanitizeData(data, ['internal']);
      expect(result).toEqual({ name: 'test' });
    });
  });

  describe('toDTO', () => {
    it('should only return allowed fields', () => {
      const data = { id: 1, name: 'test', extra: 'hide' };
      const result = toDTO(data, ['id', 'name']);
      expect(result).toEqual({ id: 1, name: 'test' });
      // @ts-expect-error - testing field removal
      expect(result.extra).toBeUndefined();
    });
  });
});
