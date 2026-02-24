import * as Sentry from '@sentry/nextjs';
import { describe, expect, it, vi } from 'vitest';

import {
  getErrorFingerprint,
  formatErrorContext,
  shouldReportToSentry,
  addSentryBreadcrumb,
  createErrorContext,
} from './error-handler-utils';

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}));

describe('error-handler-utils', () => {
  describe('getErrorFingerprint', () => {
    it('creates a fingerprint from error message and stack', () => {
      const error = new Error('Test error');
      const fingerprint = getErrorFingerprint(error);

      expect(fingerprint).toContain('Test error');
      expect(fingerprint).toContain('|');
    });

    it('returns consistent fingerprint for same error', () => {
      const error = new Error('Consistent error');
      const fp1 = getErrorFingerprint(error);
      const fp2 = getErrorFingerprint(error);

      expect(fp1).toBe(fp2);
    });

    it('handles errors with no stack trace', () => {
      const error = new Error('No stack');
      error.stack = undefined;
      const fingerprint = getErrorFingerprint(error);

      expect(fingerprint).toContain('No stack');
      expect(fingerprint).toContain('no-stack');
    });

    it('handles empty error message', () => {
      const error = new Error();
      error.message = '';
      const fingerprint = getErrorFingerprint(error);

      expect(fingerprint).toContain('Unknown error');
    });
  });

  describe('formatErrorContext', () => {
    it('includes error details', () => {
      const error = new Error('Format test');
      const context = formatErrorContext(error);

      expect(context.err).toBe(error);
      expect(context.message).toBe('Format test');
      expect(context.stack).toBeDefined();
    });

    it('includes additional context', () => {
      const error = new Error('Test');
      const additionalContext = { userId: '123', action: 'submit' };
      const context = formatErrorContext(error, additionalContext);

      expect(context.userId).toBe('123');
      expect(context.action).toBe('submit');
    });

    it('limits stack trace to first 5 lines', () => {
      const error = new Error('Stack test');
      const context = formatErrorContext(error);

      if (Array.isArray(context.stack)) {
        expect(context.stack.length).toBeLessThanOrEqual(5);
      }
    });

    it('works with empty additional context', () => {
      const error = new Error('Test');
      const context = formatErrorContext(error, {});

      expect(context.err).toBe(error);
    });
  });

  describe('shouldReportToSentry', () => {
    it('returns true for normal errors', () => {
      const error = new Error('Normal error');
      expect(shouldReportToSentry(error)).toBe(true);
    });

    it('returns false for ResizeObserver errors', () => {
      const error = new Error('ResizeObserver loop limit exceeded');
      expect(shouldReportToSentry(error)).toBe(false);
    });

    it('returns false for ignored patterns in message', () => {
      const error = new Error('cannot_render_single_session_enabled');
      expect(shouldReportToSentry(error)).toBe(false);
    });

    it('returns false for ignored patterns in stack', () => {
      const error = new Error('Some error');
      error.stack = 'Non-Error promise rejection captured';
      expect(shouldReportToSentry(error)).toBe(false);
    });

    it('returns true for unlisted errors', () => {
      const error = new Error('Unique error not in ignore list');
      expect(shouldReportToSentry(error)).toBe(true);
    });
  });

  describe('addSentryBreadcrumb', () => {
    it('calls Sentry.captureMessage with breadcrumb message', () => {
      vi.clearAllMocks();

      addSentryBreadcrumb('Test breadcrumb');

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Test breadcrumb',
        'debug',
      );
    });

    it('includes data in breadcrumb message', () => {
      vi.clearAllMocks();

      const data = { key: 'value' };
      addSentryBreadcrumb('Test', data);

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('Test'),
        'debug',
      );
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('key'),
        'debug',
      );
    });

    it('works without data parameter', () => {
      vi.clearAllMocks();

      addSentryBreadcrumb('Simple breadcrumb');

      expect(Sentry.captureMessage).toHaveBeenCalled();
    });
  });

  describe('createErrorContext', () => {
    it('creates error context with all fields', () => {
      const error = new Error('Context test');
      const context = createErrorContext(error, 3);

      expect(context.message).toBe('Context test');
      expect(context.count).toBe(3);
      expect(context.fingerprint).toBeDefined();
      expect(context.timestamp).toBeDefined();
      expect(context.lastOccurred).toBeDefined();
      expect(context.stack).toBeDefined();
    });

    it('defaults count to 1', () => {
      const error = new Error('Test');
      const context = createErrorContext(error);

      expect(context.count).toBe(1);
    });

    it('includes correct timestamp values', () => {
      const before = Date.now();
      const error = new Error('Test');
      const context = createErrorContext(error);
      const after = Date.now();

      expect(context.timestamp).toBeGreaterThanOrEqual(before);
      expect(context.timestamp).toBeLessThanOrEqual(after);
      expect(context.lastOccurred).toBe(context.timestamp);
    });
  });
});
