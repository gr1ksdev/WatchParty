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

## Observações

- Não há tentativa de burlar DRM, login, CORS ou bloqueios de provedores.
- Links com usuário/senha, esquema diferente de HTTP(S) ou host privado são recusados.
- A proteção anti-SSRF cobre literais IPv4/IPv6 e redirecionamentos. Resolução DNS
  maliciosa (rebinding) não pode ser totalmente impedida sem resolver o host no Worker;
  isso está fora do escopo do MVP.
- Falhas ao enviar mensagens são registradas em log, mas o webhook responde `200` para
  evitar que o Telegram reenvie o update e crie salas duplicadas.
- Por ora o YouTube é apenas identificado e normalizado (`videoId`); o player
  aparece na Etapa 2.
