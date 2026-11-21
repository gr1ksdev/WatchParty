import { handleApiRequest } from './api';
import type { Env } from './env';
import { handleTelegramWebhook } from './telegram/webhook';
import { applyCors } from './utils/cors';
import { json } from './utils/json';
import { handleWebSocketUpgrade } from './ws/upgrade';

export { RoomDO } from './rooms/durable-object';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'GET' && pathname === '/health') {
      return json({ status: 'ok', service: 'watchparty-bot' });
    }

    if (request.method === 'POST' && pathname === '/webhook/telegram') {
      return handleTelegramWebhook(request, env);
    }

    const wsMatch = /^\/ws\/([^/]+)$/.exec(pathname);
    if (wsMatch && request.method === 'GET') {
      return handleWebSocketUpgrade(request, env, wsMatch[1] ?? '');
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return applyCors(request, env, new Response(null, { status: 204 }));
      }
      return applyCors(request, env, await handleApiRequest(request, env));
    }

    return json({ ok: false, error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;
