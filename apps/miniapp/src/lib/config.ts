function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Em dev, `/api` é proxyado pelo Vite para o Worker local. */
export const WORKER_URL = import.meta.env.VITE_WORKER_URL
  ? stripTrailingSlash(import.meta.env.VITE_WORKER_URL)
  : '';

export const API_BASE_URL = WORKER_URL ? `${WORKER_URL}/api` : '/api';

const botUsername = (import.meta.env.VITE_BOT_USERNAME ?? '').trim().replace(/^@/, '');
export const BOT_USERNAME = botUsername;

export function buildInviteUrl(roomId: string): string | null {
  if (!BOT_USERNAME) return null;
  return `https://t.me/${encodeURIComponent(BOT_USERNAME)}?startapp=${encodeURIComponent(roomId)}`;
}

/** A simulação existe apenas em builds de desenvolvimento e com opt-in explícito. */
export const FAKE_TELEGRAM_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_FAKE_TELEGRAM === '1';
