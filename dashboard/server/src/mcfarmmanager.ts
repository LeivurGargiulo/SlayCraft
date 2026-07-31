const BASE_URL = process.env.MCFARMMANAGER_URL ?? 'http://127.0.0.1:8642';

export class McfmError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function mcfmFetch(
  pathAndQuery: string,
  init?: { method?: string; body?: unknown }
): Promise<unknown> {
  let res: Response;
  try {
    const headers: Record<string, string> = {};
    if (init?.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = process.env.MCFARMMANAGER_API_TOKEN;
    if (init?.method && init.method !== 'GET' && token) headers['X-API-Token'] = token;
    res = await fetch(`${BASE_URL}${pathAndQuery}`, {
      method: init?.method,
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new McfmError(502, 'No se pudo conectar con MCFarmManager');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new McfmError(res.status, body.error ?? 'Error de MCFarmManager');
  }
  if (res.status === 204) return null;
  return res.json();
}
