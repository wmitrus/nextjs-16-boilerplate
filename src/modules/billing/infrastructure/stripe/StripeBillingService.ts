import type { BillingService } from '../../domain/BillingService';

export class StripeBillingService implements BillingService {
  async handleWebhookEvent(_event: unknown): Promise<void> {
    throw new Error('StripeBillingService: not implemented');
  }

  async syncSubscription(
    _tenantId: string,
    _externalSubscriptionId: string,
  ): Promise<void> {
    throw new Error('StripeBillingService: not implemented');
  }
}
