import type { Env } from './env';
import { handleTelegramWebhook } from './telegram/webhook';
import { json } from './utils/json';

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

    return json({ ok: false, error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;
