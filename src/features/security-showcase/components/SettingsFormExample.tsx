'use client';

import React, { useState } from 'react';

import { updateSecuritySettings } from '../actions/showcase-actions';

/**
 * Example of a Form using a Secure Server Action.
 * Demonstrates: Handling action results and validation errors.
 */
export function SettingsFormExample() {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (
    e: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    e.preventDefault();
    setStatus('Updating...');
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await updateSecuritySettings({
      theme: formData.get('theme') as 'light' | 'dark' | 'system',
      notificationsEnabled: formData.get('notifications') === 'on',
      marketingConsent: formData.get('marketing') === 'on',
    });

    if (result.status === 'success') {
      setStatus(`Success! Result: ${JSON.stringify(result.data)}`);
    } else if (result.status === 'validation_error') {
      setError(`Validation failed: ${JSON.stringify(result.errors)}`);
      setStatus(null);
    } else {
      setError(result.error ?? 'Something went wrong');
      setStatus(null);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-lg font-semibold">Secure Server Action Form</h3>
      <p className="mb-4 text-sm text-gray-600">
        This form submits to a <code>createSecureAction</code> wrapper which
        validates the input, checks authorization, and logs the mutation on the
        server.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Theme</label>
          <select
            name="theme"
            className="mt-1 block w-full rounded border p-2 text-sm"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" name="notifications" id="notifications" />
          <label htmlFor="notifications" className="text-sm">
            Enable Notifications
          </label>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" name="marketing" id="marketing" />
          <label htmlFor="marketing" className="text-sm">
            Marketing Consent
          </label>
        </div>

        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Update Settings
        </button>
      </form>

      {status && (
        <p className="mt-4 text-sm font-medium text-green-600">{status}</p>
      )}
      {error && (
        <p className="mt-4 text-sm font-medium text-red-600">{error}</p>
      )}
    </div>
  );
}
