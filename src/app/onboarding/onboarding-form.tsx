'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { completeOnboarding } from '@/modules/auth/ui/onboarding-actions';

export function OnboardingForm({ redirectUrl }: { redirectUrl: string }) {
  const [error, setError] = React.useState('');
  const [isPending, setIsPending] = React.useState(false);
  const router = useRouter();

  const handleSubmit = async (formData: FormData) => {
    setIsPending(true);
    setError('');

    try {
      const res = await completeOnboarding(formData);
      if (res?.message) {
        router.push(res.redirectUrl ?? redirectUrl);
      }
      if (res?.error) {
        setError(res.error);
      }
    } catch (_err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="bg-card rounded-lg border p-8 shadow-sm">
      <h1 className="mb-2 text-2xl font-bold">Complete your profile</h1>
      <p className="text-muted-foreground mb-6">
        Tell us a bit about yourself to get started.
      </p>

      <form action={handleSubmit} className="space-y-6">
        <input type="hidden" name="redirect_url" value={redirectUrl} />

        <div>
          <label
            htmlFor="displayName"
            className="mb-2 block text-sm font-medium"
          >
            Display name <span className="text-destructive">*</span>
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            placeholder="Your name"
            className="border-input bg-background ring-offset-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>

        <div>
          <label htmlFor="locale" className="mb-2 block text-sm font-medium">
            Language (optional)
          </label>
          <select
            id="locale"
            name="locale"
            className="border-input bg-background ring-offset-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="">Select a language</option>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="de-DE">Deutsch</option>
            <option value="fr-FR">Français</option>
            <option value="es-ES">Español</option>
            <option value="pl-PL">Polski</option>
            <option value="ja-JP">日本語</option>
            <option value="zh-CN">中文 (简体)</option>
          </select>
        </div>

        <div>
          <label htmlFor="timezone" className="mb-2 block text-sm font-medium">
            Timezone (optional)
          </label>
          <select
            id="timezone"
            name="timezone"
            className="border-input bg-background ring-offset-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="">Select a timezone</option>
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York</option>
            <option value="America/Chicago">America/Chicago</option>
            <option value="America/Los_Angeles">America/Los_Angeles</option>
            <option value="Europe/London">Europe/London</option>
            <option value="Europe/Paris">Europe/Paris</option>
            <option value="Europe/Warsaw">Europe/Warsaw</option>
            <option value="Asia/Tokyo">Asia/Tokyo</option>
            <option value="Asia/Shanghai">Asia/Shanghai</option>
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
          {isPending ? 'Saving...' : 'Get started'}
        </button>
      </form>
    </div>
  );
}
