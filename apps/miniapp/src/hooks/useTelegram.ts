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

/**
 * O cliente Telegram entrega o start_param de diferentes formas conforme a versão
 * e o tipo de botão: propriedade do SDK, initData, hash (#tgWebAppStartParam=...) ou
 * query string (?start_param=...). Tentamos todas, em ordem de confiabilidade.
 */
export function readStartParam(webApp: TelegramWebApp | null): string | null {
  const candidates: Array<string | undefined | null> = [
    webApp?.startParam,
    webApp?.initDataUnsafe.start_param,
    window.Telegram?.WebView?.initParams?.tgWebAppStartParam,
  ];

  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace(/^#/, '');
    const queryIndex = hash.indexOf('?');
    const hashParams = new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : hash);
    candidates.push(hashParams.get('tgWebAppStartParam'));

    const query = new URLSearchParams(window.location.search);
    candidates.push(query.get('start_param'), query.get('tgWebAppStartParam'));
  }

  return candidates.find((value) => typeof value === 'string' && value.trim().length > 0) ?? null;
}

function readState(webApp: TelegramWebApp | null, isReady: boolean): TelegramState {
  return {
    available: webApp !== null,
    isReady,
    initData: webApp?.initData ?? '',
    user: webApp?.initDataUnsafe.user ?? null,
    startParam: readStartParam(webApp),
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
