/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL pública do Worker. No Vite local, `/api` é proxyado para localhost:8787. */
  readonly VITE_WORKER_URL?: string;
  /** Username do bot, usado apenas para montar o link de convite. */
  readonly VITE_BOT_USERNAME?: string;
  /** Habilita a interface de simulação fora do Telegram (apenas em dev). */
  readonly VITE_ENABLE_FAKE_TELEGRAM?: string;
  readonly VITE_FAKE_USER_ID?: string;
  readonly VITE_FAKE_FIRST_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
