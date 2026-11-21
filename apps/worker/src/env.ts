/**
 * Bindings e segredos do Worker.
 *
 * TELEGRAM_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET são configurados somente via
 * `wrangler secret put`. Nunca devem aparecer em wrangler.toml, código ou Git.
 */
export interface Env {
  ROOMS: DurableObjectNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  MINI_APP_URL: string;
  WORKER_URL?: string;
  TELEGRAM_BOT_USERNAME?: string;
  /**
   * Modo de desenvolvimento: aceita um initData simulado, explicitamente marcado.
   * Deve existir apenas em `.dev.vars`; nunca em `wrangler.toml [vars]` ou deploy.
   */
  ALLOW_FAKE_INIT_DATA?: string;
}
