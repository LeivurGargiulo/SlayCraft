const API_BASE = '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const needsJsonHeader = !isFormData && options.body !== undefined;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: needsJsonHeader ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Error de red' }));
    throw new ApiError(res.status, (body as { error?: string }).error ?? `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
