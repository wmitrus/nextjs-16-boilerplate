import { describe, expect, it } from 'vitest';

import { Container, type Module } from './index';

describe('Container', () => {
  it('should register and resolve a service', () => {
    const container = new Container();
    const service = { name: 'test-service' };
    const KEY = Symbol('TestService');

    container.register(KEY, service);
    const resolved = container.resolve(KEY);

    expect(resolved).toBe(service);
  });

  it('should throw error when resolving non-existent service', () => {
    const container = new Container();
    expect(() => container.resolve('non-existent')).toThrow(
      'Service not found for key: non-existent',
    );
  });

  it('should register a module', () => {
    const container = new Container();
    const KEY = Symbol('ModuleService');
    const service = { name: 'module-service' };

    const mockModule: Module = {
      register: (c) => {
        c.register(KEY, service);
      },
    };

    container.registerModule(mockModule);
    expect(container.resolve(KEY)).toBe(service);
  });

  it('should overwrite implementation when registering with the same key', () => {
    const container = new Container();
    const KEY = 'service';
    const first = { id: 1 };
    const second = { id: 2 };

    container.register(KEY, first);
    container.register(KEY, second);

    expect(container.resolve(KEY)).toBe(second);
  });
});
