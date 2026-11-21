import type { Env } from '../env';

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Permite apenas a origem configurada do Pages e origens locais do Vite. */
export function isAllowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  if (LOCAL_ORIGIN.test(origin)) return true;
  const miniAppOrigin = originOf(env.MINI_APP_URL);
  return miniAppOrigin !== null && origin === miniAppOrigin;
}

export function applyCors(request: Request, env: Env, response: Response): Response {
  const origin = request.headers.get('origin');
  if (!origin || !isAllowedOrigin(origin, env)) return response;

  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, authorization');
  headers.set('access-control-max-age', '86400');
  headers.append('vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
