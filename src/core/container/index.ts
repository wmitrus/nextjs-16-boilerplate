import { authModule } from '@/modules/auth';
import { authorizationModule } from '@/modules/authorization';

export type RegistryKey = string | symbol;

export interface Module {
  register(container: Container): void;
}

export class Container {
  private services = new Map<RegistryKey, unknown>();

  register<T>(key: RegistryKey, implementation: T): void {
    this.services.set(key, implementation);
  }

  resolve<T>(key: RegistryKey): T {
    const service = this.services.get(key);
    if (!service) {
      throw new Error(`Service not found for key: ${String(key)}`);
    }
    return service as T;
  }

  registerModule(module: Module): void {
    module.register(this);
  }
}

export const container = new Container();

export function bootstrap() {
  container.registerModule(authModule);
  container.registerModule(authorizationModule);
}
