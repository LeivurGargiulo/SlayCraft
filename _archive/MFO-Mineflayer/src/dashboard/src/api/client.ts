import type {
  AlertRow,
  ContainerSnapshotRow,
  FarmDetail,
  FarmMetrics,
  FarmSummary,
  HealthRow,
  ManagerStatus,
  ProductionRow,
  WorkerRow,
} from './types.js';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let token: string | undefined;
let onUnauthorized: (() => void) | undefined;

/** Set once by AuthContext on login/restore; read by every request after. */
export function setAuthToken(next: string | undefined): void {
  token = next;
}

/** AuthContext registers this once, so any 401 (bad token, expired, or backend rotated JWT_SECRET) forces a re-login instead of a page full of failed fetches. */
export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  onUnauthorized = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token !== undefined ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/login')) onUnauthorized?.();
    const body: unknown = await response.json().catch(() => undefined);
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : response.statusText;
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function query(params: Record<string, number | string | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, number | string] => entry[1] !== undefined,
  );
  if (entries.length === 0) return '';
  return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}`;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  farms: () => request<FarmSummary[]>('/farms'),
  farm: (id: string) => request<FarmDetail>(`/farm/${id}`),
  farmHealthHistory: (id: string, limit?: number) =>
    request<HealthRow[]>(`/farm/${id}/health${query({ limit })}`),
  farmStorage: (id: string) => request<ContainerSnapshotRow[]>(`/farm/${id}/storage`),
  farmProductionHistory: (id: string, limit?: number) =>
    request<ProductionRow[]>(`/farm/${id}/production${query({ limit })}`),
  farmMetrics: (id: string) => request<FarmMetrics>(`/farm/${id}/metrics`),
  farmAlerts: (id: string, limit?: number) =>
    request<AlertRow[]>(`/farm/${id}/alerts${query({ limit })}`),
  farmWorker: (id: string) => request<WorkerRow | null>(`/farm/${id}/worker`),
  manager: () => request<ManagerStatus>('/manager'),
  alerts: (limit?: number) => request<AlertRow[]>(`/alerts${query({ limit })}`),

  scan: (farmId?: string) =>
    request<{ correlationIds: string[] }>('/scan', {
      method: 'POST',
      body: JSON.stringify(farmId !== undefined ? { farmId } : {}),
    }),
  acknowledgeAlert: (alertId: number) =>
    request<{ acknowledged: boolean }>('/alert/ack', {
      method: 'POST',
      body: JSON.stringify({ alertId }),
    }),
};
