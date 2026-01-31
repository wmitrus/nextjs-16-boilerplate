import { describe, expect, it } from 'vitest';

import {
  createRedirectResponse,
  createServerErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
} from './response-service';

describe('response-service', () => {
  describe('createSuccessResponse', () => {
    it('should create a success response with status ok', async () => {
      const data = { foo: 'bar' };
      const response = createSuccessResponse(data);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({
        status: 'ok',
        data,
      });
    });

    it('should include meta when provided', async () => {
      const data = { foo: 'bar' };
      const meta = { total: 100 };
      const response = createSuccessResponse(data, 200, meta);

      const body = await response.json();
      expect(body.meta).toEqual(meta);
    });

    it('should use custom status code', () => {
      const response = createSuccessResponse({}, 201);
      expect(response.status).toBe(201);
    });
  });

  describe('createValidationErrorResponse', () => {
    it('should create a validation error response with status form_errors', async () => {
      const errors = { email: ['Invalid email'] };
      const response = createValidationErrorResponse(errors);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({
        status: 'form_errors',
        errors,
      });
    });
  });

  describe('createServerErrorResponse', () => {
    it('should create a server error response with status server_error', async () => {
      const message = 'Something went wrong';
      const response = createServerErrorResponse(message);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({
        status: 'server_error',
        error: message,
      });
    });

    it('should include code when provided', async () => {
      const response = createServerErrorResponse('Error', 500, 'ERR_CODE');
      const body = await response.json();
      expect(body.code).toBe('ERR_CODE');
    });
  });

  describe('createRedirectResponse', () => {
    it('should create a redirect response with status redirect', async () => {
      const url = '/new-path';
      const response = createRedirectResponse(url);

      expect(response.status).toBe(302);
      const body = await response.json();
      expect(body).toEqual({
        status: 'redirect',
        url,
      });
    });
  });
});
