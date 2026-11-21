/** Normaliza o payload de entrada (`startapp` / `start_param`) para um ID de sala. */
export function normalizeStartParam(value: string | null | undefined): string | null {
  if (!value) return null;
  let cleaned = value.trim().replace(/^\?/, '');
  if (cleaned.startsWith('startapp=')) cleaned = cleaned.slice('startapp='.length);
  if (cleaned.startsWith('start_param=')) cleaned = cleaned.slice('start_param='.length);
  return cleaned || null;
}
