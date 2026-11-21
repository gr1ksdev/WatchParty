/** Tipos mínimos do SDK oficial do Telegram Web Apps (carregado por `<script>`). */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  bottom_bar_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  section_separator_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

/** `initDataUnsafe` é exibido na UI, mas nunca usado para autenticar. */
export interface TelegramInitDataUnsafe {
  query_id?: string;
  user?: TelegramUser;
  receiver?: TelegramUser;
  start_param?: string;
  auth_date?: number;
  hash?: string;
}

export type TelegramEvent = 'themeChanged' | 'viewportChanged';

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: TelegramInitDataUnsafe;
  startParam?: string;
  colorScheme: 'light' | 'dark';
  themeParams: TelegramThemeParams;
  platform: string;
  version: string;
  isExpanded: boolean;
  ready(): void;
  expand(): void;
  close(): void;
  onEvent(event: TelegramEvent, callback: () => void): void;
  offEvent(event: TelegramEvent, callback: () => void): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
}

/** Parâmetros de inicialização que o cliente Telegram injeta no hash da URL. */
export interface TelegramWebView {
  initParams?: Record<string, string | undefined>;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp; WebView?: TelegramWebView };
  }
}
