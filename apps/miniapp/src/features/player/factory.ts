import { createHlsAdapter } from './adapters/hls';
import { createHtml5Adapter } from './adapters/html5';
import { createYouTubeAdapter } from './adapters/youtube';
import type { AdapterOptions, PlayerController } from './types';

export type AdapterKind = 'html5' | 'hls' | 'youtube';

export function resolveAdapterKind(source: AdapterOptions['source']): AdapterKind {
  if (source.kind === 'youtube') return 'youtube';
  if (source.kind === 'hls') return 'hls';
  return 'html5';
}

/** Fábrica única: cada adaptador trata seus próprios erros e limitações. */
export function createPlayerAdapter(options: AdapterOptions): PlayerController {
  switch (resolveAdapterKind(options.source)) {
    case 'youtube':
      return createYouTubeAdapter(options);
    case 'hls':
      return createHlsAdapter(options);
    default:
      return createHtml5Adapter(options);
  }
}
