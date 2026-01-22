import '@testing-library/jest-dom';
import React from 'react';
import { vi } from 'vitest';

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
