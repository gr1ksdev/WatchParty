import type { PlayerEvent } from './types';

export type PlayerListener = (event: PlayerEvent) => void;

/** Emissor tipado e mínimo, usado pelo motor para expor eventos ao React. */
export class EventBus {
  private readonly listeners = new Set<PlayerListener>();

  subscribe(listener: PlayerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: PlayerEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // Um listener com falha não pode impedir os demais.
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  get size(): number {
    return this.listeners.size;
  }
}
