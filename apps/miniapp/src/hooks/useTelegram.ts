import { useEffect, useState } from 'react';
import type { TelegramThemeParams, TelegramUser, TelegramWebApp } from '../types/telegram';

export interface TelegramState {
  available: boolean;
  isReady: boolean;
  initData: string;
  /** Apenas para exibição. Nunca usar como prova de autenticidade. */
  user: TelegramUser | null;
  startParam: string | null;
  colorScheme: 'light' | 'dark';
  themeParams: TelegramThemeParams;
  platform: string;
  webApp: TelegramWebApp | null;
  expand: () => void;
}

function readState(webApp: TelegramWebApp | null, isReady: boolean): TelegramState {
  return {
    available: webApp !== null,
    isReady,
    initData: webApp?.initData ?? '',
    user: webApp?.initDataUnsafe.user ?? null,
    startParam: webApp?.startParam ?? webApp?.initDataUnsafe.start_param ?? null,
    colorScheme: webApp?.colorScheme ?? 'dark',
    themeParams: webApp?.themeParams ?? {},
    platform: webApp?.platform ?? 'unknown',
    webApp,
    expand: () => webApp?.expand(),
  };
}

/** Integração com o SDK oficial carregado por `telegram-web-app.js`. */
export function useTelegram(): TelegramState {
  const [state, setState] = useState<TelegramState>(() => readState(window.Telegram?.WebApp ?? null, false));

  useEffect(() => {
    const webApp = window.Telegram?.WebApp ?? null;
    if (!webApp) return;

    try {
      webApp.ready();
      webApp.expand();
    } catch {
      // Algumas versões antigas não implementam expand(); a UI ainda funciona.
    }
    setState(readState(webApp, true));

    const sync = () => setState(readState(webApp, true));
    try {
      webApp.onEvent?.('themeChanged', sync);
      webApp.onEvent?.('viewportChanged', sync);
    } catch {
      // Versões antigas podem não suportar eventos; o tema inicial já foi aplicado.
    }

    return () => {
      try {
        webApp.offEvent?.('themeChanged', sync);
        webApp.offEvent?.('viewportChanged', sync);
      } catch {
        // Nada a fazer.
      }
    };
  }, []);

  return state;
}
