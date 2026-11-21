export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(remainder)}`
    : `${minutes}:${pad(remainder)}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

export const SOURCE_LABELS: Record<'mp4' | 'hls' | 'youtube', string> = {
  mp4: 'Vídeo direto (MP4/WebM)',
  hls: 'Stream HLS',
  youtube: 'YouTube',
};
