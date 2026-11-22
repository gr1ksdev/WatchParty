import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DRIFT_INTERVAL_MS,
  DRIFT_THRESHOLD_SECONDS,
  type ClientMessage,
  type ServerMessage,
} from '@watchparty/shared';
import type { RemotePlaybackState, WatchPartyPlayer } from '../features/player/engine';
import type { SocketTiming } from './useRoomSocket';

interface Options {
  engine: WatchPartyPlayer | null;
  isHost: boolean;
  timing: SocketTiming;
  send: (message: ClientMessage) => boolean;
}

/**
 * Ponte fina entre o motor e o WebSocket. O motor cuida do player; aqui apenas
 * transformamos eventos de comando local em mensagens e entregamos o estado
 * autoritativo do servidor ao motor.
 */
export function usePlaybackSync({ engine, isHost, timing, send }: Options) {
  const [syncState, setSyncState] = useState<RemotePlaybackState | null>(null);
  const lastVersion = useRef(-1);
  const sendRef = useRef(send);
  const isHostRef = useRef(isHost);
  const lastRemote = useRef<RemotePlaybackState | null>(null);

  useEffect(() => {
    sendRef.current = send;
    isHostRef.current = isHost;
  }, [send, isHost]);

  useEffect(() => {
    engine?.setRole(isHost);
  }, [engine, isHost]);

  useEffect(() => {
    engine?.setTiming(timing);
  }, [engine, timing]);

  // Ajuste 3: se o estado do servidor chegou antes do motor, reaplica quando ele nascer.
  useEffect(() => {
    if (engine && lastRemote.current) engine.restore(lastRemote.current);
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    return engine.subscribe((event) => {
      if (event.kind !== 'command' || event.origin !== 'host-local' || !isHostRef.current) return;
      const version = lastVersion.current >= 0 ? lastVersion.current : undefined;
      sendRef.current({
        t: 'control',
        action: event.action,
        ...(event.position === undefined ? {} : { position: event.position }),
        ...(version === undefined ? {} : { version }),
      });
    });
  }, [engine]);

  const applyMessage = useCallback(
    (message: ServerMessage, currentTiming: SocketTiming) => {
      engine?.setTiming(currentTiming);
      if (message.t === 'state') {
        const remote: RemotePlaybackState = {
          playing: message.state.playing,
          position: message.state.position,
          updatedAt: message.state.updatedAt,
          version: message.state.version,
        };
        lastVersion.current = Math.max(lastVersion.current, remote.version);
        lastRemote.current = remote;
        setSyncState(remote);
        engine?.restore(remote);
        return;
      }
      if (message.t === 'control') {
        if (message.version <= lastVersion.current) return;
        lastVersion.current = message.version;
        const remote: RemotePlaybackState = {
          playing: message.playing,
          position: message.position,
          updatedAt: message.serverTime,
          version: message.version,
        };
        lastRemote.current = remote;
        setSyncState(remote);
        engine?.applyRemote(remote);
      }
    },
    [engine],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      if (!engine || !syncState?.playing) return;
      engine.correctDrift(engine.getExpectedPosition(), DRIFT_THRESHOLD_SECONDS);
    }, DRIFT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [engine, syncState?.playing]);

  return { syncState, applyMessage };
}
