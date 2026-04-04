import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/core/logger/browser', () => ({
  getBrowserLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('./actions', () => ({
  completeOnboarding: vi.fn(),
}));

import { OnboardingForm } from './onboarding-form';

describe('OnboardingForm', () => {
  it('renders a hidden redirect_url field when redirectUrl prop is provided', () => {
    render(<OnboardingForm redirectUrl="/dashboard" />);

    const hidden = screen.getByDisplayValue('/dashboard');
    expect(hidden).toBeInTheDocument();
    expect(hidden).toHaveAttribute('type', 'hidden');
    expect(hidden).toHaveAttribute('name', 'redirect_url');
  });

  it('does not render a hidden redirect_url field when redirectUrl is not provided', () => {
    render(<OnboardingForm />);

    expect(
      screen.queryByRole('textbox', { hidden: true, name: /redirect_url/i }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('input[name="redirect_url"]'),
    ).not.toBeInTheDocument();
  });
});
