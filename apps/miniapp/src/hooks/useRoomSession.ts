import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, createSession, fetchRoom } from '../lib/api';
import type { RoomResponse, SessionUser } from '../types/api';

export type RoomSessionPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface RoomSessionError {
  code: string;
  message: string;
}

interface RoomSessionState {
  phase: RoomSessionPhase;
  data: RoomResponse | null;
  user: SessionUser | null;
  ticket: string | null;
  error: RoomSessionError | null;
}

function toSessionError(error: unknown): RoomSessionError {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      INVALID_INIT_DATA: 'O Telegram não reconheceu esta sessão. Feche e abra a sala novamente.',
      INIT_DATA_EXPIRED: 'A sessão do Telegram expirou. Feche e abra a sala novamente.',
      MISSING_TICKET: 'Sua sessão expirou. Tente novamente.',
      INVALID_TICKET: 'Sua sessão expirou. Tente novamente.',
      TICKET_EXPIRED: 'Sua sessão expirou. Tente novamente.',
      room_not_found: 'Esta sala não existe ou foi encerrada.',
      invalid_room_id: 'O ID desta sala é inválido.',
      network_error: 'Não foi possível conectar ao servidor. Verifique sua conexão.',
      missing_room: 'Nenhuma sala foi informada. Use o link de convite do bot.',
    };
    return { code: error.code, message: messages[error.code] ?? error.message };
  }
  return { code: 'unknown_error', message: 'Ocorreu um erro inesperado. Tente novamente.' };
}

/**
 * Fluxo da Etapa 2: initData → POST /api/session → GET /api/rooms/:id.
 * O WebSocket (Etapa 3) não é iniciado aqui, para não fingir sincronização.
 */
export function useRoomSession(initData: string | null, startParam: string | null) {
  const [state, setState] = useState<RoomSessionState>({ phase: 'idle', data: null, user: null, ticket: null, error: null });
  const generation = useRef(0);

  const load = useCallback(
    async (init: string) => {
      const currentGeneration = ++generation.current;
      const controller = new AbortController();
      setState({ phase: 'loading', data: null, user: null, ticket: null, error: null });

      try {
        const session = await createSession(init, controller.signal);
        const roomId = startParam ?? session.startParam;
        if (!roomId) {
          throw new ApiError('missing_room', 'Nenhuma sala foi informada. Use o link de convite do bot.', 0);
        }

        let data: RoomResponse;
        try {
          data = await fetchRoom(roomId, session.ticket, controller.signal);
        } catch (error) {
          if (error instanceof ApiError && error.code === 'TICKET_EXPIRED') {
            const refreshed = await createSession(init, controller.signal);
            data = await fetchRoom(roomId, refreshed.ticket, controller.signal);
          } else {
            throw error;
          }
        }

        if (currentGeneration !== generation.current) return;
        setState({ phase: 'ready', data, user: session.user, ticket: session.ticket, error: null });
      } catch (error) {
        if (controller.signal.aborted || currentGeneration !== generation.current) return;
        setState({ phase: 'error', data: null, user: null, ticket: null, error: toSessionError(error) });
      }
    },
    [startParam],
  );

  useEffect(() => {
    if (!initData) {
      generation.current += 1;
      setState({
        phase: 'error',
        data: null,
        user: null,
        ticket: null,
        error: {
          code: 'NO_TELEGRAM',
          message: 'Abra este Mini App pelo Telegram para entrar em uma sala.',
        },
      });
      return;
    }
    void load(initData);
    return () => {
      generation.current += 1;
    };
  }, [initData, load]);

  const retry = useCallback(() => {
    if (initData) void load(initData);
  }, [initData, load]);

  return { ...state, retry };
}
