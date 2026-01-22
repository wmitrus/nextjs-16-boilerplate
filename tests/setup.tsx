import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import React from 'react';

import { server } from '../src/shared/lib/mocks/server';

// Mock next/image
jest.mock('next/image', () => {
  return function MockImage({
    priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt || ''} />;
  };
});

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
