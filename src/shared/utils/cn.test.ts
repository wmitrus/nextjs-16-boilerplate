import { cn } from './cn';

describe('cn utility', () => {
  it('should merge classes correctly', () => {
    expect(cn('px-2 py-2', 'px-4')).toBe('py-2 px-4');
  });

  it('should handle conditional classes', () => {
    expect(cn('px-2', true && 'py-2', false && 'm-2')).toBe('px-2 py-2');
  });

  it('should handle multiple arguments', () => {
    expect(cn('px-2', 'py-2')).toBe('px-2 py-2');
  });

  it('should handle empty or null values', () => {
    expect(cn('px-2', null, undefined, '')).toBe('px-2');
  });
});
