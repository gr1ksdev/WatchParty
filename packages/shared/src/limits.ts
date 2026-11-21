/** Limites do protocolo WebSocket, compartilhados entre Worker e Mini App. */

export const MAX_WS_MESSAGE_BYTES = 4096;
export const MAX_CHAT_TEXT_LENGTH = 1000;
export const MAX_CHAT_HISTORY = 50;
export const MAX_PARTICIPANTS = 50;

export const CHAT_RATE_MS = 1000;
export const CONTROL_RATE_WINDOW_MS = 1000;
export const CONTROL_RATE_MAX = 5;

export const HEARTBEAT_INTERVAL_MS = 20_000;
export const PARTICIPANT_TIMEOUT_MS = 60_000;

export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 10_000;

export const DRIFT_INTERVAL_MS = 5_000;
export const DRIFT_THRESHOLD_SECONDS = 1.5;
/** Tempo em que os handlers locais do player são ignorados após aplicar um evento remoto. */
export const REMOTE_APPLY_WINDOW_MS = 100;
