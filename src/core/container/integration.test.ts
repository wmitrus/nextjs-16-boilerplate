/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import { Container, createContainer, type Module } from './index';

describe('Container – core wiring', () => {
  it('creates an empty container via createContainer()', () => {
    const container = createContainer();
    expect(container).toBeInstanceOf(Container);
  });

  it('resolves a registered value', () => {
    const container = new Container();
    const KEY = Symbol('test');
    container.register(KEY, 'value');
    expect(container.resolve(KEY)).toBe('value');
  });

  it('resolves from parent in child container', () => {
    const parent = new Container();
    const KEY = Symbol('parent-key');
    parent.register(KEY, 'parent-value');
    const child = parent.createChild();
    expect(child.resolve(KEY)).toBe('parent-value');
  });

  it('child registration overrides parent', () => {
    const parent = new Container();
    const KEY = Symbol('key');
    parent.register(KEY, 'parent');
    const child = parent.createChild();
    child.register(KEY, 'child');
    expect(child.resolve(KEY)).toBe('child');
    expect(parent.resolve(KEY)).toBe('parent');
  });

  it('throws when key is not found', () => {
    const container = new Container();
    expect(() => container.resolve('missing')).toThrow(
      'Service not found for key: missing',
    );
  });

  it('registerModule delegates to module.register', () => {
    const container = new Container();
    const KEY = Symbol('ModuleService');
    const mockModule: Module = {
      register(c) {
        c.register(KEY, 'from-module');
      },
    };
    container.registerModule(mockModule);
    expect(container.resolve(KEY)).toBe('from-module');
  });
});
