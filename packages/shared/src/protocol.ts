import { z } from 'zod';
import { chatMessageSchema, participantSchema, roomStateSchema } from './room';
import { MAX_CHAT_TEXT_LENGTH } from './limits';

export const controlActionSchema = z.enum(['play', 'pause', 'seek']);
export type ControlAction = z.infer<typeof controlActionSchema>;

/** `seek` exige uma posição; play/pause podem usar a posição local como referência. */
export const controlMessageSchema = z.object({
  t: z.literal('control'),
  action: controlActionSchema,
  position: z.number().finite().nonnegative().optional(),
  version: z.number().int().nonnegative().optional(),
});
export type ControlMessage = z.infer<typeof controlMessageSchema>;

export const clientMessageSchema = z
  .discriminatedUnion('t', [
    controlMessageSchema,
    z.object({
      t: z.literal('chat'),
      text: z.string().min(1).max(MAX_CHAT_TEXT_LENGTH),
    }),
    z.object({
      t: z.literal('ping'),
      ts: z.number().int().nonnegative(),
    }),
  ])
  .superRefine((value, context) => {
    if (value.t === 'control' && value.action === 'seek' && value.position === undefined) {
      context.addIssue({ code: 'custom', message: 'seek exige position', path: ['position'] });
    }
  });
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const errorCodeSchema = z.enum([
  'FORBIDDEN',
  'INVALID_MESSAGE',
  'MESSAGE_TOO_LARGE',
  'RATE_LIMITED',
  'ROOM_FULL',
  'ROOM_NOT_FOUND',
  'INVALID_TICKET',
  'TICKET_EXPIRED',
  'DUPLICATE_CONNECTION',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const serverMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('state'),
    state: roomStateSchema,
    /** Relógio do servidor no momento do snapshot (para estimar offset/RTT). */
    serverTime: z.number().int().nonnegative(),
  }),
  z.object({
    t: z.literal('control'),
    action: controlActionSchema,
    position: z.number().nonnegative(),
    playing: z.boolean(),
    serverTime: z.number().int().nonnegative(),
    version: z.number().int().nonnegative(),
    by: z.string().min(1),
  }),
  z.object({
    t: z.literal('participant'),
    action: z.enum(['join', 'leave']),
    user: participantSchema,
  }),
  z.object({ t: z.literal('chat'), message: chatMessageSchema }),
  z.object({ t: z.literal('pong'), ts: z.number().int().nonnegative() }),
  z.object({ t: z.literal('error'), code: errorCodeSchema, message: z.string().min(1) }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
