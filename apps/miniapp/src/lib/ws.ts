import { WORKER_URL } from './config';

/** Monta a URL do WebSocket sem incluir o ticket em logs ou mensagens de erro. */
export function getWebSocketUrl(roomId: string, ticket: string): string {
  const protocol = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = WORKER_URL ? new URL(WORKER_URL) : null;
  const host = base?.host ?? (typeof location !== 'undefined' ? location.host : 'localhost');
  const prefix = base?.pathname.replace(/\/+$/, '') ?? '';
  const path = `${prefix}/ws/${encodeURIComponent(roomId)}`;
  return `${protocol}//${host}${path}?ticket=${encodeURIComponent(ticket)}`;
}
