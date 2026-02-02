import '@testing-library/jest-dom';
import React from 'react';
import { vi } from 'vitest';

process.env.CLERK_SECRET_KEY = 'sk_test_mock';
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_mock';

import { server } from '../src/shared/lib/mocks/server';

// Mock next/image
vi.mock('next/image', () => {
  return {
    default: function MockImage({
      priority: _priority,
      ...props
    }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img {...props} alt={props.alt || ''} />;
    },
  };
});

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
