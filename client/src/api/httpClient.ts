import axios from 'axios';

export class ApiRequestError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

export const httpClient = axios.create({
  baseURL: '/api',
  headers: { Accept: 'application/json' },
});

httpClient.interceptors.response.use(undefined, (error: unknown) => {
  // Callers use AbortSignal to cancel stale requests without treating them as failures.
  if (axios.isCancel(error) || !axios.isAxiosError<unknown>(error)) return Promise.reject(error);

  const status = error.response?.status;
  const body = error.response?.data;
  const failure = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  const code = typeof failure?.code === 'string' ? failure.code : error.code;
  const message = typeof failure?.message === 'string' && failure.message.trim()
    ? failure.message
    : status !== undefined
      ? `Request failed (${status}).`
      : 'Could not reach the workflow server. Check your connection and try again.';
  return Promise.reject(new ApiRequestError(message, status, code));
});

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
