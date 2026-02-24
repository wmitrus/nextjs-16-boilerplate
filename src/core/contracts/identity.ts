export interface Identity {
  readonly id: string;
  readonly email?: string;
  readonly attributes?: Record<string, unknown>;
}

export interface IdentityProvider {
  getCurrentIdentity(): Promise<Identity | null>;
}
