import { z } from 'zod';
import { API_BASE_URL } from './config';
import {
  errorResponseSchema,
  roomResponseSchema,
  sessionResponseSchema,
  type RoomResponse,
  type SessionResponse,
} from '../types/api';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const fallback = response.status === 0 ? 'network_error' : 'request_failed';
  try {
    const body = errorResponseSchema.parse(await response.json());
    return new ApiError(body.error, body.message ?? 'Não foi possível concluir a solicitação.', response.status);
  } catch {
    return new ApiError(fallback, 'Não foi possível concluir a solicitação.', response.status);
  }
}

async function parseOk<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) throw await toApiError(response);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError('invalid_response', 'O servidor retornou uma resposta inválida.', response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('invalid_response', 'O servidor retornou dados inesperados.', response.status);
  }
  return parsed.data;
}

/** Envia o initData ao Worker e recebe o ticket assinado (nunca confia em initDataUnsafe). */
export async function createSession(initData: string, signal?: AbortSignal): Promise<SessionResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('network_error', 'Não foi possível conectar ao servidor.', 0);
  }
  return parseOk(response, sessionResponseSchema);
}

/** Lê os dados da sala usando o ticket. */
export async function fetchRoom(roomId: string, ticket: string, signal?: AbortSignal): Promise<RoomResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/rooms/${encodeURIComponent(roomId)}`, {
      headers: { authorization: `Bearer ${ticket}` },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('network_error', 'Não foi possível conectar ao servidor.', 0);
  }
  return parseOk(response, roomResponseSchema);
}
