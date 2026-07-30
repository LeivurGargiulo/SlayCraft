const BASE_URL = process.env.MCFARMMANAGER_URL ?? 'http://127.0.0.1:8642';

export class McfmError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function mcfmFetch(pathAndQuery: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${pathAndQuery}`);
  } catch {
    throw new McfmError(502, 'No se pudo conectar con MCFarmManager');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new McfmError(res.status, body.error ?? 'Error de MCFarmManager');
  }
  return res.json();
}
