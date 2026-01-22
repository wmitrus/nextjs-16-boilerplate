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

  it('should support arrays of classes', () => {
    expect(cn(['px-2', 'py-2'], 'm-2')).toBe('px-2 py-2 m-2');
  });

  it('should support object syntax for conditional classes', () => {
    expect(cn('px-2', { 'py-2': true, 'm-2': false })).toBe('px-2 py-2');
  });

  it('should merge conflicting tailwind utilities', () => {
    expect(cn('p-2', 'p-4', 'px-6')).toBe('p-4 px-6');
  });
});
