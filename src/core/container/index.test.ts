import { describe, expect, it, vi } from 'vitest';

import { Container, createContainer, type Module } from './index';

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

  it('should throw on duplicate key without explicit override', () => {
    const container = new Container();
    const KEY = 'service';
    const first = { id: 1 };

    container.register(KEY, first);

    expect(() => container.register(KEY, { id: 2 })).toThrow(
      'Service already registered for key: service. Pass { override: true } to replace it.',
    );
  });

  it('should overwrite implementation when override is explicit', () => {
    const container = new Container();
    const KEY = 'service';
    const first = { id: 1 };
    const second = { id: 2 };

    container.register(KEY, first);
    container.register(KEY, second, { override: true });

    expect(container.resolve(KEY)).toBe(second);
  });

  it('should cache singleton factory even when value is undefined', () => {
    const container = new Container();
    const KEY = Symbol('FactoryService');
    const factory = vi.fn(() => undefined);

    container.registerFactory(KEY, factory);

    expect(container.resolve(KEY)).toBeUndefined();
    expect(container.resolve(KEY)).toBeUndefined();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('should resolve has() recursively through parent', () => {
    const parent = new Container();
    const child = parent.createChild();
    const KEY = Symbol('ParentService');

    parent.register(KEY, { ok: true });

    expect(parent.has(KEY)).toBe(true);
    expect(child.has(KEY)).toBe(true);
    expect(child.has(Symbol('Missing'))).toBe(false);
  });

  it('should create a deterministic container with core modules registered', () => {
    const builtContainer = createContainer();
    expect(builtContainer).toBeInstanceOf(Container);
  });
});
