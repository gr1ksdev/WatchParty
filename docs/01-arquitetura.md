# Arquitetura (Etapa 1)

## Visão geral

```text
Telegram Bot API ──POST /webhook/telegram (secret_token)──▶ Cloudflare Worker
                                                            ├─ /health
                                                            ├─ Telegram Bot API (respostas)
                                                            └─ ROOMS Durable Object (criação de sala)
```

O Worker é a única camada que conhece o token do bot. O Durable Object guarda o estado
autoritativo de cada sala. O Mini App ainda não existe nesta etapa.

## Componentes

| Módulo | Responsabilidade |
|---|---|
| `src/index.ts` | Roteamento HTTP: `/health` e `/webhook/telegram` |
| `src/telegram/webhook.ts` | Validação do segredo, parsing do update, despacho dos comandos |
| `src/telegram/commands.ts` | Interpretação de comandos e construção das mensagens/teclados inline |
| `src/telegram/api.ts` | Cliente da Telegram Bot API (`sendMessage`, `getMe`) |
| `src/links/parse.ts` | Identificação síncrona de MP4/WebM, HLS e YouTube |
| `src/links/validate.ts` | HEAD + allowlist de `content-type` e proteção anti-SSRF |
| `src/rooms/api.ts` | Geração do ID e chamada ao Durable Object |
| `src/rooms/durable-object.ts` | `RoomDO`: `PUT /init` e leitura interna `GET /state` |
| `src/rooms/state.ts` | Estado inicial e `RoomStore` (camada pura, testável) |
| `packages/shared` | Tipos `RoomState`, `VideoSource` e contratos do protocolo WebSocket |

## Fluxo de `/play <link>`

1. O Telegram envia o update com `X-Telegram-Bot-Api-Secret-Token`.
2. O Worker compara o segredo em tempo constante e valida o update com `zod`.
3. `parseVideoUrl` identifica a fonte; se não houver extensão reconhecida,
   `validateVideoUrl` faz `HEAD` (máximo de 3 redirects, timeout de 3 s).
4. `createRoom` gera um ID de 8 caracteres Base32 Crockford e chama
   `ROOMS.idFromName(id)` com `PUT /init`.
5. O `RoomDO` persiste o estado inicial: pausado, posição 0, versão 0,
   `allowGuestControl: false`, sem participantes e sem mensagens.
6. O bot responde com o ID da sala e dois botões: `web_app` (Mini App com
   `start_param`) e `url` (`https://t.me/<bot>?startapp=<id>`).

## Estado da sala

O estado segue o contrato definido no `PLANO.md` e vive no armazenamento do
Durable Object sob a chave `state`. Embora WebSocket, chat e sincronização
sejam implementados na Etapa 3, as estruturas (`participants`, `chat`,
`version`, `updatedAt`, `settings`) já existem para evitar migrações futuras.

## Etapa 2 — Mini App e autenticação

```text
Mini App (Pages) ──POST /api/session (initData)──▶ Worker (HMAC WebAppData)
                 ◀── ticket assinado (60 s) ─────── Worker
                 ──GET /api/rooms/:id (Bearer)────▶ Worker ──▶ RoomDO /state
                 ◀── RoomState + viewer.isHost ───── Worker
Player ──HTTP direto──▶ origem do vídeo (MP4 / HLS / YouTube)
```

| Módulo | Responsabilidade |
|---|---|
| `src/auth/init-data.ts` | HMAC-SHA256 do `initData`, janela de `auth_date`, usuário validado |
| `src/auth/ticket.ts` | Ticket curto assinado (chave derivada do token do bot) |
| `src/auth/fake.ts` | Identidade simulada, apenas com `ALLOW_FAKE_INIT_DATA=1` |
| `src/api.ts` | Rotas REST `/api/session` e `/api/rooms/:id` |
| `src/utils/cors.ts` | Allowlist de origem (Pages + localhost do Vite) |
| `apps/miniapp/src/hooks/useTelegram.ts` | `ready()`, `expand()`, tema e dados de exibição |
| `apps/miniapp/src/hooks/useRoomSession.ts` | Orquestra sessão → sala, renovação de ticket e erros |
| `apps/miniapp/src/features/player/*` | Adaptadores HTML5, HLS e YouTube |
| `apps/miniapp/src/features/room/RoomView.tsx` | Tela da sala e permissões visuais |

O `viewer.isHost` é calculado no Worker comparando `ticket.userId` com
`room.hostId`. O Mini App nunca usa `initDataUnsafe` para autenticação.

## Etapa 3 — WebSocket e sincronização

```text
Mini App ──GET /ws/:roomId?ticket=...──▶ Worker (verifyTicket + getRoom)
                                         │ headers: x-user-id / x-user-first-name
                                         ▼
                                   RoomDO /ws ──▶ RoomRuntime (autoridade)
                                         │ fan-out: state/control/chat/participant
                                         ▼
                          todos os clientes WebSocket da sala
Player de cada cliente ──HTTP direto──▶ origem do vídeo (sem proxy)
```

| Módulo | Responsabilidade |
|---|---|
| `src/ws/upgrade.ts` | Valida ticket, verifica sala, injeta identidade e encaminha ao DO |
| `src/rooms/durable-object.ts` | Adapta `WebSocketPair`/`acceptWebSocket` ao runtime |
| `src/rooms/runtime.ts` | Estado autoritativo, permissões, presença, chat, heartbeat e fan-out |
| `packages/shared/protocol.ts` | Mensagens discriminadas e validadas com Zod |
| `packages/shared/limits.ts` | Limites de mensagem, chat, participantes, heartbeat e reconexão |
| `apps/miniapp/src/hooks/useRoomSocket.ts` | Conexão, heartbeat, backoff e renovação de ticket |
| `apps/miniapp/src/hooks/usePlaybackSync.ts` | Aplicação de eventos, anti-loop e correção de deriva |
| `apps/miniapp/src/features/room/RoomScreen.tsx` | Liga socket/sync/presença/chat à tela |

O ticket vai na query do WebSocket (nunca em logs); o Worker o valida e injeta
apenas headers confiáveis no `fetch` interno para o DO. O `RoomRuntime` nunca
confia em userId enviado pelo cliente — ele usa a identidade do attachment da
conexão. A origem do vídeo continua sendo acessada diretamente pelo dispositivo.
