export type RegistryKey = string | symbol;
export type ServiceFactory<T> = (container: Container) => T;

interface FactoryRegistration<T> {
  factory: ServiceFactory<T>;
  singleton: boolean;
  hasInstance?: boolean;
  instance?: T;
}

interface RegistrationOptions {
  override?: boolean;
}

interface FactoryOptions extends RegistrationOptions {
  singleton?: boolean;
}

type ServiceRegistration =
  | {
      kind: 'value';
      value: unknown;
    }
  | {
      kind: 'factory';
      factory: FactoryRegistration<unknown>;
    };

export interface Module {
  register(container: Container): void;
}

export class Container {
  private services = new Map<RegistryKey, ServiceRegistration>();

  constructor(private parent?: Container) {}

  private assertCanRegister(key: RegistryKey, options?: RegistrationOptions) {
    if (options?.override || !this.services.has(key)) {
      return;
    }

    throw new Error(
      `Service already registered for key: ${String(key)}. Pass { override: true } to replace it.`,
    );
  }

  register<T>(
    key: RegistryKey,
    implementation: T,
    options?: RegistrationOptions,
  ): void {
    this.assertCanRegister(key, options);

    this.services.set(key, {
      kind: 'value',
      value: implementation,
    });
  }

  registerFactory<T>(
    key: RegistryKey,
    factory: ServiceFactory<T>,
    options?: FactoryOptions,
  ): void {
    this.assertCanRegister(key, options);

    this.services.set(key, {
      kind: 'factory',
      factory: {
        factory,
        singleton: options?.singleton ?? true,
      },
    });
  }

  resolve<T>(key: RegistryKey): T {
    const service = this.services.get(key);

    if (service) {
      if (service.kind === 'value') {
        return service.value as T;
      }

      const { factory } = service;
      if (factory.singleton) {
        if (!factory.hasInstance) {
          factory.instance = factory.factory(this);
          factory.hasInstance = true;
        }

        return factory.instance as T;
      }

      return factory.factory(this) as T;
    }

    if (this.parent) {
      return this.parent.resolve<T>(key);
    }

    throw new Error(`Service not found for key: ${String(key)}`);
  }

  registerModule(module: Module): void {
    module.register(this);
  }

  createChild(): Container {
    return new Container(this);
  }
}

export function createContainer(): Container {
  return new Container();
}
