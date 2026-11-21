import type { Env } from '../env';
import { parseFakeInitData } from './fake';
import { InitDataError, validateInitData, type ValidatedInitData } from './init-data';

export interface SessionIdentity {
  userId: string;
  firstName: string;
  username?: string;
  photoUrl?: string;
  startParam?: string;
}

/**
 * Única porta de autenticação do Mini App. `initDataUnsafe` nunca é usado aqui:
 * apenas o `initData` assinado (ou o modo simulado, explicitamente habilitado).
 */
export async function authenticateInitData(initData: string, env: Env): Promise<SessionIdentity> {
  const validated: ValidatedInitData | null =
    parseFakeInitData(initData, env) ?? (await validateInitData(initData, env.TELEGRAM_BOT_TOKEN));

  if (!validated) {
    throw new InitDataError('INVALID_INIT_DATA', 'initData inválido.');
  }

  return {
    userId: String(validated.user.id),
    firstName: validated.user.first_name,
    ...(validated.user.username ? { username: validated.user.username } : {}),
    ...(validated.user.photo_url ? { photoUrl: validated.user.photo_url } : {}),
    ...(validated.startParam ? { startParam: validated.startParam } : {}),
  };
}
