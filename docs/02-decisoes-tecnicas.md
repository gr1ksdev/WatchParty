# Decisões técnicas

As decisões abaixo seguem o `PLANO.md` e foram aprovadas antes da implementação.

| Tema | Decisão | Motivo |
|---|---|---|
| Monorepo | npm workspaces, sem ferramentas extras | `npm install` já resolve os workspaces |
| Linguagem | TypeScript estrito em todas as camadas | Contratos compartilhados e menos erros |
| Contratos | `zod` em `packages/shared` | A mesma validação no Worker e, depois, no Mini App |
| Backend | Cloudflare Worker + Durable Objects | Webhooks, API e estado por sala sem VPS |
| Persistência | Armazenamento do próprio Durable Object | Não há consultas de sala no MVP; evita D1 |
| Controle | Somente o host (`allowGuestControl: false`) | Decisão aprovada; evita conflitos de reprodução |
| Mini App | Cloudflare Pages, URL configurável em `MINI_APP_URL` | Domínio gratuito; destino provisório até a Etapa 2 |
| Links ambíguos | `HEAD` + allowlist de `content-type`, timeout 3 s | Permite URLs sem extensão sem aceitar qualquer conteúdo |
| Segurança do webhook | `X-Telegram-Bot-Api-Secret-Token` | Mecanismo nativo do Telegram |
| Segredo do bot | `wrangler secret put TELEGRAM_BOT_TOKEN` | Nunca em código, `wrangler.toml` ou Git |
| IDs de sala | 8 caracteres Base32 Crockford (40 bits) | Curto o suficiente para `startapp`; sem caracteres ambíguos |
| Autenticação do Mini App | `initData` validado por HMAC no Worker; ticket curto assinado | `initDataUnsafe` serve apenas para exibição; o ticket evita expor o `initData` em logs |
| Chave do ticket | Derivada do token do bot com HMAC + domínio separado | Evita configurar outro segredo; token continua somente no Worker |
| CORS da API | Allowlist: origem de `MINI_APP_URL` + `localhost` do Vite | Mini App e Worker ficam em domínios diferentes |
| Modo simulado | Opt-in duplo (`VITE_ENABLE_FAKE_TELEGRAM` + `ALLOW_FAKE_INIT_DATA`) | Isolado, desativado por padrão e nunca configurado em deploy |
| Player | Adaptadores HTML5 / hls.js / IFrame API do YouTube | Mesma interface para play/pause/seek; erros tratados por adaptador |
| Autenticação do WS | Ticket na query do `/ws/:id`, validado no Worker; identidade injetada por header no DO | Mantém `initData`/ticket fora de logs e impede falsificação de userId |
| Protocolo | Zod em `packages/shared`, união discriminada por `t` | Validação idêntica nos dois lados, mensagens desconhecidas rejeitadas |
| Autoridade | `RoomRuntime` dentro do DO formata estado, versão, presença e chat | Regras testáveis sem API WebSocket da Cloudflare |
| Sincronização | Eventos de controle (não `timeupdate`), broadcast exceto originador, versão monotonicamente crescente | Evita loops de eventos e mantém a origem como única autoridade |
| Deriva | Correção por seek quando |diferença| > 1,5 s a cada ~5 s | Simples, previsível e compatível com HTML5/HLS/YouTube |
| Presença | Participante = conexão WebSocket ativa; heartbeat 20 s, timeout 60 s | Não confunde histórico com usuários online |
| Chat | Ring buffer de 50 mensagens, 1 msg/s por usuário, texto sem HTML | Histórico limitado e sem execução de script |
| Reconexão | Backoff 1→2→4→…→10 s com renovação de ticket e snapshot do DO | Recupera estado sem criar conexões duplicadas |

## Observações

- Não há tentativa de burlar DRM, login, CORS ou bloqueios de provedores.
- Links com usuário/senha, esquema diferente de HTTP(S) ou host privado são recusados.
- A proteção anti-SSRF cobre literais IPv4/IPv6 e redirecionamentos. Resolução DNS
  maliciosa (rebinding) não pode ser totalmente impedida sem resolver o host no Worker;
  isso está fora do escopo do MVP.
- Falhas ao enviar mensagens são registradas em log, mas o webhook responde `200` para
  evitar que o Telegram reenvie o update e crie salas duplicadas.
- O YouTube é identificado e normalizado (`videoId`) no Worker; o player usa a
  IFrame API diretamente no dispositivo, sem proxy de mídia.
