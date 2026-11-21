import { FAKE_TELEGRAM_ENABLED } from './config';

export const FAKE_INIT_DATA_PREFIX = 'fake:';

export interface FakeIdentity {
  userId: number;
  firstName: string;
  username?: string;
  startParam?: string;
}

/** Retorna uma identidade simulada somente quando o modo dev está habilitado. */
export function getFakeIdentity(): FakeIdentity | null {
  if (!FAKE_TELEGRAM_ENABLED) return null;
  if (typeof window === 'undefined') return null;

  const query = new URLSearchParams(window.location.search);
  const userId = Number(query.get('fake_user_id') ?? import.meta.env.VITE_FAKE_USER_ID ?? 777);
  const firstName =
    query.get('fake_first_name') ?? import.meta.env.VITE_FAKE_FIRST_NAME ?? 'Usuário de teste';

  if (!Number.isInteger(userId) || userId <= 0 || !firstName.trim()) return null;

  const username = query.get('fake_username') ?? undefined;
  const startParam = query.get('start_param') ?? undefined;
  return {
    userId,
    firstName,
    ...(username ? { username } : {}),
    ...(startParam ? { startParam } : {}),
  };
}

/** Formato reconhecido apenas pelo Worker com `ALLOW_FAKE_INIT_DATA=1`. */
export function buildFakeInitData(identity: FakeIdentity): string {
  const json = JSON.stringify(identity);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${FAKE_INIT_DATA_PREFIX}${encoded}`;
}
