import { authModule } from '@/modules/auth';
import { authorizationModule } from '@/modules/authorization';

export type RegistryKey = string | symbol;

export interface Module {
  register(container: Container): void;
}

export class Container {
  private services = new Map<RegistryKey, unknown>();

  constructor(private onResolveMissing?: (container: Container) => void) {}

  register<T>(key: RegistryKey, implementation: T): void {
    this.services.set(key, implementation);
  }

  resolve<T>(key: RegistryKey): T {
    let service = this.services.get(key);

    if (!service && this.onResolveMissing) {
      this.onResolveMissing(this);
      service = this.services.get(key);
    }

    if (!service) {
      throw new Error(`Service not found for key: ${String(key)}`);
    }
    return service as T;
  }

  registerModule(module: Module): void {
    module.register(this);
  }
}

let isBootstrapped = false;

function registerCoreModules(target: Container): void {
  if (isBootstrapped) {
    return;
  }

  target.registerModule(authModule);
  target.registerModule(authorizationModule);
  isBootstrapped = true;
}

export const container = new Container(registerCoreModules);

export function bootstrap() {
  registerCoreModules(container);
}
