/** Compatibilidade de imports: a fábrica canônica vive em `engine/registry`. */
export { createAdapter as createPlayerAdapter, isGoogleDriveUrl } from './engine/registry';
export type { AdapterContext, PlayerAdapter } from './engine/types';
