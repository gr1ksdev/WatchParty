# Roteiro de validação — Etapa 3

## Objetivo

Validar duas sessões independentes (host e convidado) com o fluxo completo de
sincronização, chat, presença e reconexão.

## Pré-requisitos locais

1. `npm install`.
2. Em `apps/worker/.dev.vars` (nunca versionado):

   ```dotenv
   TELEGRAM_BOT_TOKEN=123456:token-de-teste-local
   TELEGRAM_WEBHOOK_SECRET=segredo-local-de-teste
   ALLOW_FAKE_INIT_DATA=1
   ```

3. Terminal 1: `npm run dev --workspace @watchparty/worker` (porta 8787).
4. Terminal 2 (opcional, para a UI): `npm run dev --workspace @watchparty/miniapp`
   (porta 5173, com proxy de `/api` e `/ws`).

O endpoint `POST /api/dev/rooms` existe **somente** com `ALLOW_FAKE_INIT_DATA=1`.
Ele cria uma sala usando a mesma autenticação (`authenticateInitData`) e a mesma
criação (`createRoom`) do fluxo real — sem Telegram e sem duplicar lógica.

## Execução automatizada

```bash
npm run test:e2e:ws
```

O script `scripts/e2e-ws.mjs` usa apenas `fetch`/`WebSocket` nativos do Node e
verifica, nesta ordem:

1. A cria a sala pelo bot (aqui via endpoint dev) e vira host (`hostId=777`).
2. A e B obtêm tickets próprios via `POST /api/session`.
3. Ambos conectam em `/ws/:roomId?ticket=...` e recebem `state`.
4. A envia `control/play` em 10 s; B recebe o evento (A não recebe o próprio).
5. B tenta `control/pause`: recebe `FORBIDDEN` e o estado permanece `playing=true`.
6. A e B trocam `chat`; o texto é sanitizado e o nome do remetente é preservado.
7. `ping/pong` responde.
8. B desconecta; A recebe `participant/leave`.
9. B reconecta com ticket renovado e recebe `state` com `playing=true`, posição
   atualizada, participantes e histórico de chat.
10. Uma conexão com ticket inválido é rejeitada no upgrade.

## Resultado obtido nesta implementação

Executado em 21/11/2026 contra `wrangler dev` local (Durable Object local):

```text
PASS sala criada com host 777
PASS sessões emitidas para os dois usuários
PASS ambos receberam o estado inicial
PASS host identificado pelo servidor
PASS dois participantes conectados
PASS play do host distribuído
PASS originador não recebe próprio controle
PASS controle de convidado rejeitado
PASS estado inalterado após FORBIDDEN
PASS chat distribuído e sanitizado
PASS remetente identificado
PASS heartbeat respondido
PASS saída notificada aos demais
PASS reconexão recupera estado atual
PASS histórico de chat preservado
PASS ticket inválido rejeitado
RESULTADO: 16/16 verificações passaram
```

Os logs do Wrangler confirmaram `101 Switching Protocols` para as conexões
válidas e `401 Unauthorized` para o ticket inválido.

## O que ainda depende de teste manual

- Abrir o Mini App em dois dispositivos reais (Telegram Android/iOS/Desktop) com
  `initData` assinado pelo Telegram.
- Conferir a percepção de latência, a animação do slider e o áudio/vídeo em HLS e
  YouTube sob redes reais (o ambiente automatizado cobre a lógica, não a mídia).
- Validar o indicador de conexão durante trocas de rede no celular.

## Cobertura automatizada complementar

- `apps/worker/src/rooms/runtime.test.ts` — duas conexões em memória, versões,
  limites de chat/controle, heartbeat e recuperação de estado.
- `apps/worker/src/ws/upgrade.test.ts` — autenticação do upgrade e headers injetados.
- `apps/miniapp/src/hooks/useRoomSocket.test.tsx` — conexão, heartbeat, backoff,
  renovação de ticket e limpeza na desmontagem.
- `apps/miniapp/src/hooks/usePlaybackSync.test.tsx` — estado inicial, controle,
  versões antigas, anti-loop e correção de deriva.
- `apps/miniapp/src/components/Chat.test.tsx` e `Participants.test.tsx` — envio,
  sanitização e atualização da lista.
