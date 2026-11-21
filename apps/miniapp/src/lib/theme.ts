import type { TelegramThemeParams, TelegramWebApp } from '../types/telegram';

const CSS_VARIABLES: Record<keyof TelegramThemeParams, string> = {
  bg_color: '--wp-bg',
  text_color: '--wp-text',
  hint_color: '--wp-hint',
  link_color: '--wp-link',
  button_color: '--wp-button',
  button_text_color: '--wp-button-text',
  secondary_bg_color: '--wp-surface',
  header_bg_color: '--wp-header',
  bottom_bar_bg_color: '--wp-bottom-bar',
  accent_text_color: '--wp-accent',
  section_bg_color: '--wp-section',
  section_header_text_color: '--wp-section-title',
  section_separator_color: '--wp-separator',
  subtitle_text_color: '--wp-subtitle',
  destructive_text_color: '--wp-danger',
};

/** Aplica o tema do Telegram em variáveis CSS; valores ausentes usam os defaults do CSS. */
export function applyTelegramTheme(webApp: TelegramWebApp | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (!webApp) {
    root.removeAttribute('data-theme');
    return;
  }

  root.dataset.theme = webApp.colorScheme;
  for (const [key, cssVariable] of Object.entries(CSS_VARIABLES)) {
    const value = webApp.themeParams[key as keyof TelegramThemeParams];
    if (value) root.style.setProperty(cssVariable, value);
  }
  root.style.colorScheme = webApp.colorScheme;

  try {
    // setHeaderColor/setBackgroundColor existem a partir da versão 6.1 do SDK.
    if (Number(webApp.version) >= 6.1) {
      webApp.setHeaderColor?.(webApp.themeParams.header_bg_color ?? webApp.themeParams.bg_color ?? '#17212b');
      webApp.setBackgroundColor?.(webApp.themeParams.bg_color ?? '#17212b');
    }
  } catch {
    // Versões antigas do SDK podem não expor esses métodos; o tema CSS já foi aplicado.
  }
}
