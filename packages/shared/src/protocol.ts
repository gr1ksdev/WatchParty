import { z } from 'zod';
import { chatMessageSchema, participantSchema, roomStateSchema } from './room';

export const controlActionSchema = z.enum(['play', 'pause', 'seek']);
export type ControlAction = z.infer<typeof controlActionSchema>;

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('control'),
    action: controlActionSchema,
    position: z.number().nonnegative().optional(),
    version: z.number().int().nonnegative().optional(),
  }),
  z.object({
    t: z.literal('chat'),
    text: z.string().min(1).max(1000),
  }),
  z.object({
    t: z.literal('ping'),
    ts: z.number().int().nonnegative(),
  }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('state'), state: roomStateSchema }),
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
  z.object({ t: z.literal('error'), code: z.string().min(1), message: z.string().min(1) }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
