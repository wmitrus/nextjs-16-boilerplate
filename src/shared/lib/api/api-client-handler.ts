import type {
  ApiResponse,
  FormErrorsResponse,
  RedirectResponse,
  ServerErrorResponse,
  SuccessResponse,
} from '@/shared/types/api-response';

/**
 * Utility to process the API response on the client side.
 * It simplifies the usage of the discriminated union.
 */
export function handleApiResponse<T>(response: ApiResponse<T>) {
  return {
    isOk: response.status === 'ok',
    isFormError: response.status === 'form_errors',
    isServerError: response.status === 'server_error',
    isRedirect: response.status === 'redirect',
    data:
      response.status === 'ok' ? (response as SuccessResponse<T>).data : null,
    meta:
      response.status === 'ok' ? (response as SuccessResponse<T>).meta : null,
    errors:
      response.status === 'form_errors'
        ? (response as FormErrorsResponse).errors
        : null,
    error:
      response.status === 'server_error'
        ? (response as ServerErrorResponse).error
        : null,
    code:
      response.status === 'server_error'
        ? (response as ServerErrorResponse).code
        : null,
    url:
      response.status === 'redirect'
        ? (response as RedirectResponse).url
        : null,
  };
}
