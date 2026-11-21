import { z } from 'zod';

export const telegramUserSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean().optional(),
  first_name: z.string(),
  username: z.string().optional(),
});
export type TelegramUser = z.infer<typeof telegramUserSchema>;

const messageSchema = z.object({
  message_id: z.number().int(),
  text: z.string().optional(),
  chat: z.object({ id: z.number().int() }),
  from: telegramUserSchema.optional(),
});

/** Subconjunto de Update necessário para os comandos da Etapa 1. */
export const updateSchema = z.object({
  update_id: z.number().int(),
  message: messageSchema.optional(),
  edited_message: messageSchema.optional(),
});
export type Update = z.infer<typeof updateSchema>;

const apiResponseSchema = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
  description: z.string().optional(),
  error_code: z.number().int().optional(),
});

export function parseApiResponse(data: unknown): { ok: true; result: unknown } | { ok: false; description: string } {
  const parsed = apiResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, description: 'Resposta inválida da Telegram Bot API' };
  }
  if (!parsed.data.ok) {
    return { ok: false, description: parsed.data.description ?? 'Erro desconhecido da Telegram Bot API' };
  }
  return { ok: true, result: parsed.data.result };
}
