import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DRIFT_INTERVAL_MS,
  DRIFT_THRESHOLD_SECONDS,
  REMOTE_APPLY_WINDOW_MS,
  type ClientMessage,
  type ControlAction,
  type ServerMessage,
} from '@watchparty/shared';
import { clampTime, type PlayerController } from '../features/player/types';
import type { SocketTiming } from './useRoomSocket';

export interface SyncState {
  playing: boolean;
  position: number;
  updatedAt: number;
  version: number;
}

interface Options {
  controller: PlayerController | null;
  isHost: boolean;
  duration: number;
  timing: SocketTiming;
  send: (message: ClientMessage) => boolean;
}

/**
 * Conecta o estado autoritativo do RoomDO ao adaptador de player.
 * Nunca envia timeupdate contínuo: apenas eventos de controle do host.
 */
export function usePlaybackSync({ controller, isHost, duration, timing, send }: Options) {
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const controllerRef = useRef(controller);
  const durationRef = useRef(duration);
  const timingRef = useRef(timing);
  const isHostRef = useRef(isHost);
  const sendRef = useRef(send);
  const syncRef = useRef<SyncState | null>(null);
  const lastVersion = useRef(-1);
  const applyingRemote = useRef(false);
  const remoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCorrection = useRef(0);

  useEffect(() => {
    controllerRef.current = controller;
    durationRef.current = duration;
    timingRef.current = timing;
    isHostRef.current = isHost;
    sendRef.current = send;
  }, [controller, duration, timing, isHost, send]);

  useEffect(() => {
    return () => {
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
    };
  }, []);

  const applyToPlayer = useCallback((playing: boolean, target: number) => {
    const player = controllerRef.current;
    if (!player) return;
    applyingRemote.current = true;
    try {
      const safeTarget = clampTime(target, durationRef.current);
      if (playing) {
        player.seekTo(safeTarget);
        void player.play();
      } else {
        player.pause();
        player.seekTo(safeTarget);
      }
    } finally {
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
      remoteTimer.current = setTimeout(() => {
        applyingRemote.current = false;
      }, REMOTE_APPLY_WINDOW_MS);
    }
  }, []);

  const expectedPosition = useCallback(
    (state: SyncState, currentTiming: SocketTiming) => {
      const nowServer = Date.now() + currentTiming.clockOffset;
      const delta = Math.max(0, (nowServer - state.updatedAt + currentTiming.rtt / 2) / 1000);
      return state.position + (state.playing ? delta : 0);
    },
    [],
  );

  /** Aplica mensagens do servidor ao player, descartando versões antigas. */
  const applyMessage = useCallback(
    (message: ServerMessage, currentTiming: SocketTiming) => {
      if (message.t === 'state') {
        const next: SyncState = {
          playing: message.state.playing,
          position: message.state.position,
          updatedAt: message.state.updatedAt,
          version: message.state.version,
        };
        // Snapshot é sempre autoritativo (especialmente após reconexão); não é descartado.
        lastVersion.current = Math.max(lastVersion.current, next.version);
        syncRef.current = next;
        setSyncState(next);
        applyToPlayer(next.playing, expectedPosition(next, currentTiming));
        return;
      }

      if (message.t === 'control') {
        if (message.version <= lastVersion.current) return;
        lastVersion.current = message.version;
        const next: SyncState = {
          playing: message.playing,
          position: message.position,
          updatedAt: message.serverTime,
          version: message.version,
        };
        syncRef.current = next;
        setSyncState(next);
        if (message.action === 'pause') {
          applyToPlayer(false, message.position);
        } else {
          const delta =
            (Date.now() + currentTiming.clockOffset - message.serverTime + currentTiming.rtt / 2) / 1000;
          applyToPlayer(message.playing, message.position + (message.playing ? delta : 0));
        }
      }
    },
    [applyToPlayer, expectedPosition],
  );

  /** Host envia apenas eventos de controle e aplica a ação localmente de forma otimista. */
  const sendControl = useCallback(
    (action: ControlAction, position?: number): boolean => {
      if (!isHostRef.current) return false;
      const player = controllerRef.current;
      const rawPosition = position ?? player?.getCurrentTime() ?? 0;
      const sentPosition = clampTime(rawPosition, durationRef.current);
      const version = lastVersion.current >= 0 ? lastVersion.current : undefined;
      const ok = sendRef.current({
        t: 'control',
        action,
        position: sentPosition,
        ...(version === undefined ? {} : { version }),
      });
      if (!ok) return false;

      applyToPlayer(action === 'play', sentPosition);
      const previous = syncRef.current;
      const next: SyncState = {
        playing: action === 'play' ? true : action === 'pause' ? false : (previous?.playing ?? false),
        position: sentPosition,
        updatedAt: Date.now() + timingRef.current.clockOffset,
        version: Math.max(lastVersion.current, 0) + 1,
      };
      syncRef.current = next;
      setSyncState(next);
      return true;
    },
    [applyToPlayer],
  );

  // Correção de deriva: seek apenas quando a diferença passa de 1,5 s.
  useEffect(() => {
    const interval = setInterval(() => {
      const state = syncRef.current;
      const player = controllerRef.current;
      if (!state?.playing || !player || applyingRemote.current) return;
      if (Date.now() - lastCorrection.current < DRIFT_INTERVAL_MS) return;

      const expected = expectedPosition(state, timingRef.current);
      const actual = player.getCurrentTime();
      if (durationRef.current > 0 && Math.abs(actual - expected) > DRIFT_THRESHOLD_SECONDS) {
        player.seekTo(clampTime(expected, durationRef.current));
        lastCorrection.current = Date.now();
      }
    }, DRIFT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [expectedPosition]);

  return {
    syncState,
    applyMessage,
    sendControl,
    expectedPosition,
    isApplyingRemote: () => applyingRemote.current,
  };
}
