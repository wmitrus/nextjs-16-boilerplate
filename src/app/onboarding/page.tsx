import { OnboardingClientProbe } from './onboarding-client-probe';
import { OnboardingForm } from './onboarding-form';

export default function OnboardingPage() {
  return (
    <>
      <OnboardingForm />
      <OnboardingClientProbe />
    </>
  );
}
