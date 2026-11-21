// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TelegramEvent, TelegramWebApp } from '../types/telegram';
import { useTelegram } from './useTelegram';

function installWebApp(overrides: Partial<TelegramWebApp> = {}) {
  const listeners = new Map<TelegramEvent, Set<() => void>>();
  const webApp: TelegramWebApp = {
    initData: 'init-data-assinado',
    initDataUnsafe: {
      user: { id: 777, first_name: 'Ana', username: 'ana' },
      start_param: 'ABC12345',
    },
    startParam: 'ABC12345',
    colorScheme: 'dark',
    themeParams: { bg_color: '#17212b' },
    platform: 'android',
    version: '8.0',
    isExpanded: false,
    ready: vi.fn(),
    expand: vi.fn(),
    close: vi.fn(),
    onEvent: vi.fn((event: TelegramEvent, callback: () => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(callback);
      listeners.set(event, set);
    }),
    offEvent: vi.fn((event: TelegramEvent, callback: () => void) => {
      listeners.get(event)?.delete(callback);
    }),
    ...overrides,
  };
  window.Telegram = { WebApp: webApp };
  return { webApp, listeners };
}

afterEach(() => {
  delete window.Telegram;
});

describe('useTelegram', () => {
  it('inicializa o SDK com ready/expand e expõe os dados de exibição', () => {
    const { webApp } = installWebApp();
    const { result } = renderHook(() => useTelegram());

    expect(webApp.ready).toHaveBeenCalledOnce();
    expect(webApp.expand).toHaveBeenCalledOnce();
    expect(result.current.available).toBe(true);
    expect(result.current.isReady).toBe(true);
    expect(result.current.initData).toBe('init-data-assinado');
    expect(result.current.startParam).toBe('ABC12345');
    expect(result.current.user?.first_name).toBe('Ana');
    act(() => result.current.expand());
    expect(webApp.expand).toHaveBeenCalledTimes(2);
  });

  it('reage a mudanças de tema e remove os listeners ao desmontar', () => {
    const { webApp, listeners } = installWebApp();
    const { result, unmount } = renderHook(() => useTelegram());

    webApp.colorScheme = 'light';
    act(() => {
      listeners.get('themeChanged')?.forEach((callback) => callback());
    });
    expect(result.current.colorScheme).toBe('light');

    unmount();
    expect(webApp.offEvent).toHaveBeenCalledWith('themeChanged', expect.any(Function));
  });

  it('funciona sem o SDK (modo de desenvolvimento)', () => {
    const { result } = renderHook(() => useTelegram());
    expect(result.current.available).toBe(false);
    expect(result.current.initData).toBe('');
    expect(result.current.startParam).toBeNull();
  });
});
