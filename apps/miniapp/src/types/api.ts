import { roomStateSchema } from '@watchparty/shared';
import { z } from 'zod';

export const sessionUserSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1),
  username: z.string().optional(),
  photoUrl: z.string().optional(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const sessionResponseSchema = z.object({
  ok: z.literal(true),
  ticket: z.string().min(1),
  expiresAt: z.number().int().positive(),
  user: sessionUserSchema,
  startParam: z.string().optional(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const roomResponseSchema = z.object({
  ok: z.literal(true),
  room: roomStateSchema,
  viewer: z.object({
    userId: z.string().min(1),
    isHost: z.boolean(),
  }),
});
export type RoomResponse = z.infer<typeof roomResponseSchema>;

export const errorResponseSchema = z.object({
  ok: z.literal(false).optional(),
  error: z.string().min(1),
  message: z.string().optional(),
});
