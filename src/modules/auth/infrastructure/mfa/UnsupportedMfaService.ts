import type {
  MfaService,
  MfaStatus,
  MfaSubject,
  MfaVerification,
} from '@/core/contracts/mfa';

/**
 * The MFA service for auth providers this repository has not implemented a
 * second factor for (SEC-48).
 *
 * It fails closed rather than being absent: an unregistered service would
 * make the container throw at the step-up guard and turn a *policy* gap into
 * a 500. Reporting "not enrolled" and "unavailable" instead means an admin
 * mutation under such a provider is refused, with a reason an operator can
 * read, and no path exists to satisfy the challenge.
 *
 * `supabase` and `neon` are placeholder providers in this codebase; if either
 * becomes runtime-complete, it needs a real adapter, not this one.
 */
export class UnsupportedMfaService implements MfaService {
  constructor(private readonly provider: string) {}

  async getStatus(_subject: MfaSubject): Promise<MfaStatus> {
    return {
      enrolled: false,
      enrollmentSurface: 'provider',
      // Deliberately not a link: there is nowhere to enroll. The consumer
      // shows the reason instead of a dead end.
      enrollmentUrl: '',
    };
  }

  async verifyChallenge(
    _subject: MfaSubject,
    _code: string,
  ): Promise<MfaVerification> {
    return { ok: false, reason: 'unavailable' };
  }

  describeProvider(): string {
    return this.provider;
  }
}
