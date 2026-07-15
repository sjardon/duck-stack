export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends RequestInit {
  token?: string;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestOptions,
): Promise<T> {
  const { token, ...init } = options ?? {};
  const baseUrl = import.meta.env.VITE_API_URL as string;

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  console.log(`apiFetch: ${init.method ?? 'GET'} ${baseUrl}${path} with token: ${token ? '***' : 'none'}`);

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });

  console.log(`apiFetch: response status ${response.status} for ${init.method ?? 'GET'} ${baseUrl}${path}`);

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);

    if (response.status === 403) {
      try {
        const body = JSON.parse(text) as { code?: string };
        if (body.code === 'TRIAL_EXPIRED') {
          window.location.replace('/trial-expired');
        }
      } catch {
        // Non-JSON body — fall through to normal error
      }
    }

    throw new ApiError(text, response.status);
  }

  return response.json() as Promise<T>;
}
