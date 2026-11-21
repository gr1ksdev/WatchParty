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
