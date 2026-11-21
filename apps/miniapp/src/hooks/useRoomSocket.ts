import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HEARTBEAT_INTERVAL_MS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  serverMessageSchema,
  type ClientMessage,
  type ServerMessage,
} from '@watchparty/shared';
import { createSession } from '../lib/api';
import { getWebSocketUrl } from '../lib/ws';

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface SocketTiming {
  rtt: number;
  clockOffset: number;
}

export interface UseRoomSocketOptions {
  roomId: string;
  initData: string;
  initialTicket: string;
  onMessage: (message: ServerMessage, timing: SocketTiming) => void;
}

/**
 * Transporte WebSocket: handshake autenticado, heartbeat, backoff exponencial e
 * renovação de ticket. Nenhum ticket é registrado em log.
 */
export function useRoomSocket({ roomId, initData, initialTicket, onMessage }: UseRoomSocketOptions) {
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [timing, setTiming] = useState<SocketTiming>({ rtt: 0, clockOffset: 0 });

  const socketRef = useRef<WebSocket | null>(null);
  const ticketRef = useRef(initialTicket);
  const attemptRef = useRef(0);
  const cancelledRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingPong = useRef<{ ts: number; sentAt: number } | null>(null);
  const rttRef = useRef(0);
  const offsetRef = useRef(0);
  const onMessageRef = useRef(onMessage);
  const connectRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    ticketRef.current = initialTicket;
  }, [initialTicket]);

  useEffect(() => {
    cancelledRef.current = false;

    const stopPing = () => {
      if (pingTimer.current) clearInterval(pingTimer.current);
      pingTimer.current = null;
    };

    const closeCurrent = () => {
      const socket = socketRef.current;
      socketRef.current = null;
      if (!socket) return;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // Conexão já encerrada.
      }
    };

    const scheduleReconnect = () => {
      if (cancelledRef.current) return;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS);
      attemptRef.current += 1;
      setStatus('reconnecting');
      reconnectTimer.current = setTimeout(() => {
        void connectRef.current();
      }, delay);
    };

    connectRef.current = async () => {
      if (cancelledRef.current) return;
      closeCurrent();
      setStatus(attemptRef.current === 0 ? 'connecting' : 'reconnecting');

      let ticket = ticketRef.current;
      if (attemptRef.current > 0) {
        // Ticket de 60 s: renova antes de cada nova tentativa.
        try {
          const session = await createSession(initData);
          ticket = session.ticket;
          ticketRef.current = ticket;
        } catch {
          scheduleReconnect();
          return;
        }
      }
      if (cancelledRef.current) return;

      let socket: WebSocket;
      try {
        socket = new WebSocket(getWebSocketUrl(roomId, ticket));
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setStatus('connected');
        stopPing();
        pingTimer.current = setInterval(() => {
          const ts = Date.now();
          pendingPong.current = { ts, sentAt: ts };
          if (socketRef.current?.readyState === 1) {
            socketRef.current.send(JSON.stringify({ t: 'ping', ts }));
          }
        }, HEARTBEAT_INTERVAL_MS);
      };

      socket.onmessage = (event: MessageEvent) => {
        let data: unknown;
        try {
          data = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const parsed = serverMessageSchema.safeParse(data);
        if (!parsed.success) return;
        const message = parsed.data;

        if (message.t === 'pong') {
          if (pendingPong.current?.ts === message.ts) {
            const rtt = Date.now() - pendingPong.current.sentAt;
            rttRef.current = rtt;
            pendingPong.current = null;
            setTiming((current) => ({ ...current, rtt }));
          }
          return;
        }

        if (message.t === 'state') {
          const measured = message.serverTime - Date.now();
          offsetRef.current =
            offsetRef.current === 0 ? measured : offsetRef.current * 0.8 + measured * 0.2;
          setTiming((current) => ({ ...current, clockOffset: offsetRef.current }));
        }

        onMessageRef.current(message, { rtt: rttRef.current, clockOffset: offsetRef.current });
      };

      socket.onerror = () => {
        // `onclose` sempre segue; a reconexão é feita lá.
      };

      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        stopPing();
        scheduleReconnect();
      };
    };

    void connectRef.current();

    return () => {
      cancelledRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      stopPing();
      closeCurrent();
    };
  }, [roomId, initData]);

  const send = useCallback((message: ClientMessage): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== 1) return false;
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }, []);

  const reconnect = useCallback(() => {
    cancelledRef.current = false;
    attemptRef.current = 0;
    void connectRef.current();
  }, []);

  const disconnect = useCallback(() => {
    cancelledRef.current = true;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // Nada a fazer.
      }
    }
    setStatus('disconnected');
  }, []);

  return { status, timing, send, reconnect, disconnect };
}
