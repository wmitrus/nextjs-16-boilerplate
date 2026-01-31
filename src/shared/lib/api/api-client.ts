import type { ApiResponse } from '@/shared/types/api-response';

export class ApiClientError extends Error {
  public status: string;
  public statusCode: number;
  public errors?: Record<string, string[]>;
  public code?: string;
  public url?: string;
  public correlationId?: string | null;

  constructor(
    json: ApiResponse<unknown>,
    statusCode: number,
    correlationId?: string | null,
  ) {
    const message =
      json.status === 'server_error'
        ? json.error
        : json.status === 'form_errors'
          ? 'Validation failed'
          : json.status === 'redirect'
            ? `Redirect to ${json.url}`
            : 'Unknown API error';

    super(message);
    this.name = 'ApiClientError';
    this.status = json.status;
    this.statusCode = statusCode;
    this.correlationId = correlationId;

    if (json.status === 'form_errors') {
      this.errors = json.errors;
    } else if (json.status === 'server_error') {
      this.code = json.code;
    } else if (json.status === 'redirect') {
      this.url = json.url;
    }
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const correlationId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-correlation-id': correlationId,
      ...options?.headers,
    },
  });

  if (response.status === 204) {
    return {} as T;
  }

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }
    return {} as T;
  }

  const json = (await response.json()) as ApiResponse<T>;

  if (json.status !== 'ok') {
    const serverCorrelationId = response.headers.get('x-correlation-id');
    throw new ApiClientError(
      json,
      response.status,
      serverCorrelationId || correlationId,
    );
  }

  return json.data;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
