/**
 * Tiny fetch wrapper for talking to our API. It:
 *  - sends cookies (same-origin, so the session rides along automatically),
 *  - attaches the `x-dc-web` header on state-changing requests (the CSRF check),
 *  - turns non-2xx responses into a thrown ApiError carrying the server message.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: string | undefined;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (method !== 'GET' && method !== 'HEAD') {
    headers['x-dc-web'] = '1';
  }

  const res = await fetch(path, { method, headers, body: payload });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data ? String(data.error) : res.statusText) || 'request failed';
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/** Multipart file upload — the browser sets the content-type/boundary itself. */
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(path, { method: 'POST', headers: { 'x-dc-web': '1' }, body: form });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data ? String(data.error) : res.statusText) || 'upload failed';
    throw new ApiError(res.status, message);
  }
  return data as T;
}
