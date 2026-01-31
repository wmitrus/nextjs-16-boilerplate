export type ApiStatus = 'ok' | 'form_errors' | 'server_error' | 'redirect';

export interface BaseApiResponse {
  status: ApiStatus;
}

export interface SuccessResponse<T> extends BaseApiResponse {
  status: 'ok';
  data: T;
  meta?: Record<string, unknown>;
}

export interface FormErrorsResponse extends BaseApiResponse {
  status: 'form_errors';
  errors: Record<string, string[]>;
}

export interface ServerErrorResponse extends BaseApiResponse {
  status: 'server_error';
  error: string;
  code?: string;
}

export interface RedirectResponse extends BaseApiResponse {
  status: 'redirect';
  url: string;
}

export type ApiResponse<T> =
  | SuccessResponse<T>
  | FormErrorsResponse
  | ServerErrorResponse
  | RedirectResponse;

export { AppError } from '../lib/api/app-error';
