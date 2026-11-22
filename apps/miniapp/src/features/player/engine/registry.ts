import type { VideoSource } from '@watchparty/shared';
import { GoogleDriveAdapter } from '../adapters/GoogleDriveAdapter';
import { Html5Adapter } from '../adapters/Html5Adapter';
import { HlsAdapter } from '../adapters/HlsAdapter';
import { YouTubeAdapter } from '../adapters/YouTubeAdapter';
import type { AdapterContext, PlayerAdapter } from './types';

export function isGoogleDriveUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'drive.google.com' || host === 'docs.google.com';
  } catch {
    return false;
  }
}

/** Único ponto do player que conhece a tecnologia por trás da fonte. */
export function createAdapter(context: AdapterContext): PlayerAdapter {
  if (isGoogleDriveUrl(context.source.url)) return new GoogleDriveAdapter(context);
  switch (context.source.kind) {
    case 'youtube':
      return new YouTubeAdapter(context);
    case 'hls':
      return new HlsAdapter(context);
    default:
      return new Html5Adapter(context);
  }
}
