import type fs from 'node:fs';

import { jest } from '@jest/globals';

import { performSetup } from './setup-env.mjs';

describe('setup-env', () => {
  it('should fail if example file is missing', () => {
    const mockFs = {
      existsSync: jest.fn().mockReturnValue(false),
    } as unknown as typeof fs;

    const result = performSetup(mockFs);
    expect(result.success).toBe(false);
    expect(result.message).toContain('.env.example not found');
  });

  it('should skip if local file already exists', () => {
    const mockFs = {
      existsSync: jest.fn().mockReturnValue(true),
    } as unknown as typeof fs;

    const result = performSetup(mockFs);
    expect(result.success).toBe(true);
    expect(result.message).toContain('already exists');
  });

  it('should copy file if local missing', () => {
    const mockFs = {
      existsSync: jest
        .fn()
        .mockReturnValueOnce(true) // example exists
        .mockReturnValueOnce(false), // local missing
      copyFileSync: jest.fn(),
    } as unknown as typeof fs;

    const result = performSetup(mockFs);
    expect(result.success).toBe(true);
    expect(mockFs.copyFileSync).toHaveBeenCalled();
  });
});
