'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { completeOnboarding } from '@/modules/auth/ui/onboarding-actions';

export default function OnboardingPage() {
  const [error, setError] = React.useState('');
  const [isPending, setIsPending] = React.useState(false);
  const { user } = useUser();
  const router = useRouter();

  const handleSubmit = async (formData: FormData) => {
    setIsPending(true);
    setError('');
    console.log('Onboarding: submitting form');

    try {
      const res = await completeOnboarding(formData);
      console.log('Onboarding: server action response', res);
      if (res?.message) {
        // Forces a token refresh and refreshes the `User` object
        console.log('Onboarding: success, reloading user');
        await user?.reload();
        console.log('Onboarding: redirecting to home');
        router.push('/');
      }
      if (res?.error) {
        console.error('Onboarding: server error', res.error);
        setError(res?.error);
      }
    } catch (_err) {
      console.error('Onboarding: unexpected error', _err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="bg-card rounded-lg border p-8 shadow-sm">
      <h1 className="mb-2 text-2xl font-bold">Welcome to LingoLearn!</h1>
      <p className="text-muted-foreground mb-6">
        Let&apos;s customize your learning experience.
      </p>

      <form action={handleSubmit} className="space-y-6">
        <div>
          <label
            htmlFor="targetLanguage"
            className="mb-2 block text-sm font-medium"
          >
            What language do you want to learn?
          </label>
          <select
            id="targetLanguage"
            name="targetLanguage"
            required
            className="border-input bg-background ring-offset-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="">Select a language</option>
            <option value="spanish">Spanish</option>
            <option value="french">French</option>
            <option value="german">German</option>
            <option value="japanese">Japanese</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="proficiencyLevel"
            className="mb-2 block text-sm font-medium"
          >
            What is your current proficiency level?
          </label>
          <select
            id="proficiencyLevel"
            name="proficiencyLevel"
            required
            className="border-input bg-background ring-offset-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="">Select your level</option>
            <option value="beginner">Beginner (A1-A2)</option>
            <option value="intermediate">Intermediate (B1-B2)</option>
            <option value="advanced">Advanced (C1-C2)</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="learningGoal"
            className="mb-2 block text-sm font-medium"
          >
            What is your primary learning goal?
          </label>
          <select
            id="learningGoal"
            name="learningGoal"
            required
            className="border-input bg-background ring-offset-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="">Select a goal</option>
            <option value="travel">Travel</option>
            <option value="business">Business</option>
            <option value="academic">Academic</option>
            <option value="personal">Personal Interest</option>
          </select>
        </div>

        {error && (
          <div className="bg-destructive/15 text-destructive rounded-md p-3 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring w-full rounded-md px-4 py-2 text-sm font-medium shadow transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Start Learning'}
        </button>
      </form>
    </div>
  );
}
