import fs from 'fs';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { env } from '@/core/env';

import {
  ensureLogDirectory,
  createConsoleStream,
  createFileStream,
  createLogflareWriteStream,
} from './utils';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));

vi.mock('pino', async () => {
  const actual = await vi.importActual('pino');
  return {
    ...actual,
    destination: vi.fn(() => ({ on: vi.fn() })),
  };
});

vi.mock('pino-logflare', () => ({
  createWriteStream: vi.fn(() => ({ on: vi.fn() })),
}));

vi.mock('@/core/env', () => ({
  env: {
    LOGFLARE_API_KEY: 'test-key',
    LOGFLARE_SOURCE_TOKEN: 'test-token',
    LOG_LEVEL: 'info',
  },
}));

describe('logger utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ensureLogDirectory', () => {
    it('should return true if directory exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const result = ensureLogDirectory('logs');
      expect(result).toBe(true);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should create directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = ensureLogDirectory('logs');
      expect(result).toBe(true);
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), {
        recursive: true,
      });
    });

    it('should return false if mkdirSync fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error('fail');
      });
      const result = ensureLogDirectory('logs');
      expect(result).toBe(false);
    });
  });

  describe('createConsoleStream', () => {
    it('should return a pretty stream', () => {
      const stream = createConsoleStream();
      expect(stream).toBeDefined();
    });
  });

  describe('createFileStream', () => {
    it('should return null if directory cannot be ensured', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error();
      });
      const stream = createFileStream('test.log', 'logs');
      expect(stream).toBeNull();
    });

    it('should return a destination stream', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const stream = createFileStream('test.log', 'logs');
      expect(stream).toBeDefined();
    });

    it('should handle stream error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const stream = createFileStream('test.log', 'logs');

      // Trigger the error event
      const streamOn =
        stream && 'on' in stream && typeof stream.on === 'function'
          ? (stream.on as (
              event: string,
              handler: (error: Error) => void,
            ) => void)
          : undefined;
      const errorHandler = streamOn
        ? vi
            .mocked(streamOn)
            .mock.calls.find(([event]) => event === 'error')?.[1]
        : undefined;
      if (errorHandler) errorHandler(new Error('test error'));

      expect(consoleSpy).toHaveBeenCalledWith(
        'File stream error:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('createLogflareWriteStream', () => {
    it('should return null if logflare env vars are missing', () => {
      const originalApiKey = (
        env as unknown as Record<string, string | undefined>
      ).LOGFLARE_API_KEY;
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (env as unknown as Record<string, string | undefined>).LOGFLARE_API_KEY =
        undefined;
      const stream = createLogflareWriteStream();
      expect(stream).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Logflare stream disabled'),
      );
      consoleSpy.mockRestore();
      (env as unknown as Record<string, string | undefined>).LOGFLARE_API_KEY =
        originalApiKey;
    });

    it('should return a write stream when env vars are set', () => {
      const stream = createLogflareWriteStream();
      expect(stream).toBeDefined();
    });

    it('should handle stream error gracefully', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const stream = createLogflareWriteStream();

      const streamOn =
        stream && 'on' in stream && typeof stream.on === 'function'
          ? (stream.on as (
              event: string,
              handler: (error: Error) => void,
            ) => void)
          : undefined;
      const errorHandler = streamOn
        ? vi
            .mocked(streamOn)
            .mock.calls.find(([event]) => event === 'error')?.[1]
        : undefined;
      if (errorHandler) errorHandler(new Error('test error'));

      expect(consoleSpy).toHaveBeenCalledWith(
        'Logflare stream error (non-fatal):',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });
});
