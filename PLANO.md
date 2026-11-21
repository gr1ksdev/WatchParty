# Watch Party — Plano do MVP (Bot do Telegram + Mini App)

Projeto: aplicação de Watch Party para o Telegram, inspirada em apps como o Rave. Várias pessoas assistem ao mesmo vídeo em uma sala compartilhada, com reprodução sincronizada e interface própria (não um navegador genérico).

**Decisões aprovadas:**

| Decisão | Escolha |
|---|---|
| Bot no BotFather | Já criado, token disponível (configurar via `wrangler secret`, nunca commitar) |
| Controles de reprodução | **Apenas o host** pode dar play/pause/seek; convidados assistem e conversam |
| Hospedagem do Mini App | **Cloudflare Pages** (`pages.dev`), domínio gratuito |
| Links ambíguos | **HEAD + allowlist de `content-type`**, com proteção anti-SSRF |

---

## 1. Objetivo e escopo

Permitir que o usuário envie um link de vídeo ao bot, crie uma sala, convide outras pessoas pelo Telegram e assista com reprodução sincronizada dentro do Mini App.

### MVP

- Criar sala de reprodução.
- Compartilhar convite pelo Telegram.
- Entrar em sala por link.
- Reproduzir vídeos no Mini App.
- Sincronizar play, pause e seek.
- Exibir participantes conectados.
- Chat de texto simples.

### Fora do escopo

- Chamadas de voz/vídeo e compartilhamento de câmera.
- Contornar DRM, autenticação, limites de acesso ou restrições de provedores.
- Retransmitir mídia pelo backend nesta versão.
- VPS e Go nesta etapa (Go pode ser considerado depois para proxy/cache/retransmissão).

---

## 2. Estrutura de diretórios proposta

Monorepo com **npm workspaces** (sem ferramenta extra obrigatória):

```text
WatchParty/
├── package.json                 # workspaces + scripts (dev, build, deploy, test)
├── tsconfig.base.json           # config TypeScript compartilhada
├── .gitignore
├── README.md
├── PLANO.md                     # este documento
├── docs/
│   ├── 01-arquitetura.md
│   ├── 02-decisoes-tecnicas.md
│   └── 03-setup-e-testes.md
├── packages/
│   └── shared/                  # @watchparty/shared
│       ├── src/
│       │   ├── protocol.ts      # ClientMsg / ServerMsg (união discriminada)
│       │   ├── room.ts          # RoomState, Source, Participant, ChatMessage
│       │   └── index.ts
│       └── package.json
├── apps/
│   ├── worker/                  # Cloudflare Worker (bot + API + WebSocket)
│   │   ├── wrangler.toml        # bindings DO, vars, migrations
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts              # router fetch()
│   │       ├── env.ts                # tipos dos bindings/segredos
│   │       ├── telegram/
│   │       │   ├── api.ts            # sendMessage, answerCallbackQuery, setWebhook
│   │       │   ├── commands.ts       # /start, /play, /help
│   │       │   └── webhook.ts        # validação do secret token + update
│   │       ├── auth/
│   │       │   ├── init-data.ts      # HMAC WebAppData + auth_date
│   │       │   └── ticket.ts         # ticket curto assinado para o WebSocket
│   │       ├── links/
│   │       │   ├── parse.ts          # detecta mp4 / hls / youtube
│   │       │   └── validate.ts       # protocolo, hosts, HEAD content-type, SSRF
│   │       ├── rooms/
│   │       │   ├── api.ts            # POST /rooms, GET /rooms/:id
│   │       │   └── durable-object.ts # RoomDO: estado + WS hub + chat
│   │       ├── ws/
│   │       │   └── upgrade.ts        # autentica e repassa ao DO
│   │       └── utils/
│   │           ├── ids.ts
│   │           └── json.ts
│   └── miniapp/                 # React + Vite (Cloudflare Pages)
│       ├── index.html           # inclui telegram-web-app.js
│       ├── vite.config.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── styles/
│           │   ├── global.css
│           │   └── room.css
│           ├── components/
│           │   ├── RoomView.tsx
│           │   ├── InviteCard.tsx
│           │   ├── Participants.tsx
│           │   ├── Chat.tsx
│           │   ├── Controls.tsx
│           │   └── player/
│           │       ├── index.tsx         # factory por tipo de fonte
│           │       ├── types.ts          # PlayerController comum
│           │       ├── Html5Player.tsx   # MP4/WebM
│           │       ├── HlsPlayer.tsx     # hls.js (native no Safari)
│           │       └── YouTubePlayer.tsx # IFrame Player API
│           ├── hooks/
│           │   ├── useTelegram.ts
│           │   ├── useRoomApi.ts
│           │   ├── useRoomSocket.ts
│           │   └── usePlaybackSync.ts
│           └── lib/
│               ├── api.ts
│               └── clock.ts       # offsets de relógio/RTT
└── scripts/
    ├── set-webhook.mjs
    └── dev-tunnel.md
```

**Separação de responsabilidades:** `worker` = Telegram + API + autoridade da sala; `miniapp` = apenas UI; `shared` = contratos de protocolo usados pelos dois lados. Nada de "tudo em um único arquivo".

---

## 3. Arquitetura detalhada do MVP

```text
Telegram Bot API ──webhook(secret)──▶ Cloudflare Worker
                                       ├─ /webhook/telegram  (comandos)
                                       ├─ /api/*             (REST validado)
                                       └─ /ws/:roomId        (upgrade autenticado)
                                              │
                                              ▼
                                      Durable Object "RoomDO"
                                       (1 por sala; estado + WS + chat)
                                              │
Mini App (React/Pages) ──WebSocket────────────┘
        │
        └── player ──HTTP direto──▶ origem do vídeo (MP4/HLS/YouTube)
```

### 3.1 Responsabilidades por camada

| Camada | Faz | Não faz |
|---|---|---|
| Worker | webhook, comandos, validar `initData`, emitir ticket, rotear para DO | não transporta vídeo |
| RoomDO | estado autoritativo, fan-out WS, participantes, chat, rate limit | não valida identidade diretamente do cliente (confia no header injetado pelo Worker) |
| Mini App | UI, adapters de player, aplicar sincronização | não assina nada, não confia em dados do usuário |
| Origem | entrega o vídeo | — |

### 3.2 Estado autoritativo (no DO)

```ts
type RoomState = {
  id: string                  // 8-10 chars, cabe em startapp (limite 64)
  source: { kind: 'mp4'|'hls'|'youtube'; url: string; videoId?: string }
  hostId: string | null       // preenchido quando o host entra
  playing: boolean
  position: number            // segundos
  updatedAt: number           // ms do relógio do DO (Date.now())
  version: number             // incrementa a cada mudança → descarta eventos velhos
  settings: { allowGuestControl: false }
  participants: Participant[]
  chat: ChatMessage[]         // ring buffer de ~50 mensagens
}
```

Persistência: armazenamento transacional do próprio Durable Object. **Sem D1/Postgres** no MVP — não há necessidade de listar ou consultar salas, pois o ID resolve o stub diretamente via `idFromName(roomId)`.

### 3.3 Protocolo WebSocket (`packages/shared/protocol.ts`)

```ts
// cliente → servidor
| { t: 'control'; action: 'play'|'pause'|'seek'; position?: number; version?: number }
| { t: 'chat'; text: string }
| { t: 'ping'; ts: number }

// servidor → cliente
| { t: 'state'; state: RoomState }                       // snapshot completo ao conectar
| { t: 'control'; action; position; serverTime; version; by: string }
| { t: 'participant'; action: 'join'|'leave'; user }
| { t: 'chat'; message }
| { t: 'pong'; ts: number }
| { t: 'error'; code: string; message: string }
```

Mensagens JSON com **união discriminada** por `t`, validadas com `zod` no Worker e no Mini App.

### 3.4 Permissões (apenas host controla)

- `settings.allowGuestControl = false` por padrão.
- O DO compara `session.userId` (vindo do ticket validado) com `hostId`.
- Comandos `control` de não-host são rejeitados com `{ t: 'error', code: 'FORBIDDEN' }`.
- `hostId` é preenchido quando o autor do `/play` entra na sala, comparando seu `user.id` validado do `initData`.
- Chat e presença permanecem liberados para todos os participantes.
- A estrutura com `allowGuestControl` fica preparada para flexibilizar depois sem mudar o protocolo.

### 3.5 Sincronização (ponto crítico)

1. O cliente envia apenas **eventos de controle** — não transmite `timeupdate` contínuo.
2. O DO atualiza `{ playing, position, updatedAt: Date.now(), version++ }` e faz broadcast **para todos exceto o originador**. Isso já elimina metade dos loops.
3. Cada cliente aplica:

```ts
const delta = (Date.now() - msg.serverTime + rtt / 2) / 1000
const target = clamp(msg.position + (msg.playing ? delta : 0), 0, duration)
// play():  player.seekTo(target); player.play()
// pause(): player.pause(); player.seekTo(msg.position)
```

4. Anti-loop no cliente: flag `applyingRemote` antes de chamar `play/pause/seek`, limpa após ~100 ms; handlers do player ignoram eventos enquanto a flag está ativa.
5. Ordem: mensagens com `version < ultimaVersion` são descartadas.
6. Deriva: a cada ~5 s, se `|currentTime - esperado| > 1,5 s` e a reprodução está ativa, faz seek de correção (throttled). `rtt` vem de `ping/pong`.
7. YouTube usa o mesmo `PlayerController`, adaptando `getCurrentTime/seekTo/playVideo/pauseVideo`; o adapter normaliza o comportamento assíncrono do IFrame.

### 3.6 Reconexão

- Backoff exponencial: 1 s → 2 s → 4 s → teto 10 s.
- Ao reconectar, o DO envia `state` completo; o cliente calcula a posição usando `updatedAt` (não confia no próprio relógio para "onde o vídeo deveria estar").
- Heartbeat: cliente `ping` a cada 20 s; DO remove participantes sem sinal por >60 s e transmite `leave`.
- Se a fonte mudar (fora do MVP), o `state` dispara recarregamento do player.

### 3.7 Validação de links (sem contornar restrições)

`parseSource()` em etapas:

1. `new URL()`, apenas `http:`/`https:`.
2. YouTube: hosts `youtube.com`, `www`, `m`, `youtu.be`, `youtube-nocookie.com` + paths `watch`, `embed`, `live`, `shorts`; extrai `videoId` de 11 caracteres.
3. HLS: `/\.m3u8($|\?)/i`.
4. Arquivo: `/\.(mp4|m4v|webm|ogv)(\?|$)/i`.
5. Ambíguo: `HEAD` com timeout de 3 s, aceitando `video/mp4`, `video/webm`, `application/vnd.apple.mpegurl`, `application/x-mpegURL`, `video/mpegurl`. Bloquear redirecionamentos para hosts internos.
6. Rejeitar IPs privados/loopback/link-local literais no `HEAD` (anti-SSRF).

Links com login, DRM, hotlink blocking ou CORS restritivo são **recusados com mensagem clara**, sem tentativa de burla.

### 3.8 Segurança e confiabilidade

- Webhook: header `X-Telegram-Bot-Api-Secret-Token` conferido no Worker.
- `initData`: HMAC-SHA256 com chave `HMAC_SHA256("WebAppData", BOT_TOKEN)`, comparação em tempo constante, `auth_date` com janela de ~10 min, nonce simples contra replay.
- Token do bot **só** em `wrangler secret`. Nada de secret no bundle do Pages.
- WebSocket: o cliente recebe um **ticket assinado de curta duração** (`POST /api/session`, ~60 s) obtido com o `initData`. O ticket vai na query do WS (evita expor o `initData` em logs); o Worker valida no upgrade e injeta `X-User-Id` no `fetch` para o DO. O DO nunca lê identidade do cliente diretamente.
- Limites: 50 participantes/sala, chat 1 msg/s/usuário, controle 5 eventos/s/usuário, tamanho máximo de mensagem WS.
- Tratamento de desconexões conforme §3.6.

---

## 4. Tecnologias e dependências

| Pacote | Uso | Dependências |
|---|---|---|
| `apps/worker` | webhook, API, autenticação, roteamento DO | `wrangler`, `@cloudflare/workers-types`, `zod`, `@watchparty/shared` |
| `apps/miniapp` | interface | `react`, `react-dom`, `hls.js`, `vite`, `@vitejs/plugin-react`, `typescript`, `@watchparty/shared`, `@types/react`, `@types/react-dom` |
| `packages/shared` | protocolo e tipos | `zod`, `typescript` |
| raiz | testes e tipagem | `typescript`, `vitest` |
| SDK Telegram | integração | script oficial `https://telegram.org/js/telegram-web-app.js` + hook `useTelegram` próprio (sem dependência extra) |

Notas:

- YouTube IFrame API carregada via script injection — sem pacote adicional (opcional `youtube-player` depois).
- Não adicionar `@telegram-apps/sdk`, Tailwind, state manager ou ORM agora: o SDK oficial global + CSS próprio atendem ao MVP com menos peso.
- `wrangler.toml` com `[[durable_objects.bindings]]`, `[[migrations]]` e `[vars]` para `MINI_APP_URL`/`WORKER_URL`.
- TypeScript com tipagem adequada em todas as camadas; evitar dependências desnecessárias.

---

## 5. Comunicação entre bot, Mini App e backend

### 5.1 Configuração

`npm run webhook:set` chama `setWebhook` com `secret_token` e URL `https://<worker>/webhook/telegram`. O token é configurado com `wrangler secret put TELEGRAM_BOT_TOKEN`.

### 5.2 `/play <link>`

1. Telegram envia update com entidades `bot_command` + `url`.
2. Worker valida o link (`links/parse.ts` + `validate.ts`).
3. Gera `roomId`, chama `ROOMS.idFromName(roomId).fetch(PUT /init)` para criar a sala (host = autor do comando).
4. Responde com `sendMessage` e teclado inline:
   - `[Abrir sala]` → `web_app: { url: MINI_APP_URL + "/?start_param=<roomId>" }`
   - `[Convidar amigos]` → `url: https://t.me/<bot>?startapp=<roomId>`

### 5.3 `/start <roomId>`

Bot responde com botão `web_app` para entrar naquela sala. Sem payload: apresentação + `/help`.

### 5.4 Boot do Mini App

1. `Telegram.WebApp.ready()`, `expand()`, lê `initData` e `startParam`.
2. `POST /api/session` com `initData` → Worker valida e devolve ticket assinado.
3. `GET /api/rooms/:id` (com ticket) → metadados da sala.
4. Abre `wss://<worker>/ws/:roomId?ticket=...` → Worker valida ticket → DO aceita o WebSocket e envia `state`.

### 5.5 Durante a sala

Controles, chat e presença trafegam apenas pelo WebSocket do DO. O vídeo é buscado diretamente pelo player na origem — o backend nunca retransmite bytes de mídia no MVP.

---

## 6. Etapas de desenvolvimento

1. **Etapa 1 — Bot de teste:** `/start`, `/help`, `/play`, criar sala de teste, botão para abrir o Mini App.
2. **Etapa 2 — Mini App:** React + TypeScript + Vite, SDK do Telegram, interface da sala, player funcional com vídeos de teste.
3. **Etapa 3 — Sincronização:** Durable Objects, WebSockets, play/pause/seek, testes com usuários e dispositivos diferentes.
4. **Etapa 4 — Recursos adicionais:** participantes, chat, convites/permissões, melhorias de UI/UX.

---

## 7. Primeiro teste de reprodução e sincronização

### Local (rápido)

1. `wrangler dev` + `vite dev`; flag de dev `ALLOW_FAKE_INIT_DATA` permite simular dois usuários sem Telegram.
2. Dois contextos de navegador (usuários A e B) entram na mesma sala via `/?start_param=teste123`.
3. Fonte de teste MP4 público: `https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`.
4. A (host) dá play em t≈30 s → B deve dar play em ≤1 s e com posição próxima; testar pause e seek; checar lista de participantes e chat nos dois lados. Confirmar que controles de B são rejeitados com `FORBIDDEN`.
5. Fechar B por 5 s e reconectar → B recebe `state` e "pula" para a posição correta.

### Integração (Telegram real)

1. Deploy do worker e do Pages; configurar webhook.
2. Duas contas/dispositivos (Android + iOS, se possível).
3. `/play <mp4>` → abrir sala → compartilhar convite → segundo usuário entra via `startapp`.
4. Validar sincronização, chat, presença e reconexão após troca de rede.
5. Repetir com HLS (`https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`) e, depois, YouTube.

**Critério de aceite da Etapa 3:** divergência de tempo < 1 s em condições normais, sem loops de eventos e com recuperação correta após reconexão.

---

## 8. Etapa 1 — escopo concreto de implementação

Arquivos a criar nesta ordem:

1. **Base:** `package.json` (workspaces), `tsconfig.base.json`, `.gitignore`, `README.md`, `docs/03-setup-e-testes.md`.
2. **`packages/shared`:** `room.ts`, `protocol.ts`, `index.ts` — tipos de `Source`, `RoomState`, `Participant` e as uniões discriminadas de mensagens (já com papel de host).
3. **`apps/worker`:**
   - `wrangler.toml` (binding `ROOMS`, migration `v1` com `RoomDO`, vars `MINI_APP_URL`/`WORKER_URL`);
   - `src/env.ts`, `src/utils/*`;
   - `src/telegram/api.ts` (fetch à Bot API), `commands.ts`, `webhook.ts`;
   - `src/links/parse.ts` + `validate.ts`;
   - `src/rooms/durable-object.ts` com `PUT /init` criando a sala e guardando `hostId`, `source` e `playing:false`;
   - `src/rooms/api.ts` e `src/index.ts` com o router (`/webhook/telegram`, `GET /health`);
   - `scripts/set-webhook.mjs`.
4. **Validação local:** `npm test` (vitest) para `parseSource`, validação de `initData` e formato das mensagens; `npm run check` (tsc).

**Resultado esperado da Etapa 1:** `/start` e `/help` respondem; `/play <link MP4>` valida a URL, cria a sala no DO e devolve mensagem com os botões **[Abrir sala]** (`web_app`) e **[Convidar amigos]** (`t.me/<bot>?startapp=<roomId>`); `/start <roomId>` devolve o botão de entrada. O Mini App ainda não existe nesta etapa — o botão pode apontar para uma página provisória ou para a URL do Pages preenchida na Etapa 2.
