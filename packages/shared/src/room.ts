import { z } from 'zod';

/** Identificadores de sala: 8 caracteres Crockford Base32 (sem I, L, O, U). */
export const ROOM_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;

export const sourceKindSchema = z.enum(['mp4', 'hls', 'youtube']);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const videoSourceSchema = z.object({
  kind: sourceKindSchema,
  url: z.string().url(),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).optional(),
});
export type VideoSource = z.infer<typeof videoSourceSchema>;

export const participantRoleSchema = z.enum(['host', 'guest']);
export type ParticipantRole = z.infer<typeof participantRoleSchema>;

export const participantSchema = z.object({
  userId: z.string().min(1),
  firstName: z.string().min(1),
  username: z.string().optional(),
  role: participantRoleSchema,
  joinedAt: z.number().int().nonnegative(),
});
export type Participant = z.infer<typeof participantSchema>;

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  text: z.string().min(1).max(1000),
  createdAt: z.number().int().nonnegative(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** Decisão aprovada: apenas o host controla a reprodução no MVP. */
export const roomSettingsSchema = z.object({
  allowGuestControl: z.literal(false),
});
export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const roomStateSchema = z.object({
  id: z.string().regex(ROOM_ID_PATTERN),
  source: videoSourceSchema,
  hostId: z.string().min(1),
  playing: z.boolean(),
  position: z.number().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  settings: roomSettingsSchema,
  participants: z.array(participantSchema),
  chat: z.array(chatMessageSchema),
});
export type RoomState = z.infer<typeof roomStateSchema>;

export const newRoomInputSchema = z.object({
  id: z.string().regex(ROOM_ID_PATTERN),
  source: videoSourceSchema,
  hostId: z.string().min(1),
});
export type NewRoomInput = z.infer<typeof newRoomInputSchema>;
