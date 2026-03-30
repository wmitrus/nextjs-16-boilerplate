export interface BillingService {
  handleWebhookEvent(event: unknown): Promise<void>;
  syncSubscription(
    tenantId: string,
    externalSubscriptionId: string,
  ): Promise<void>;
}
