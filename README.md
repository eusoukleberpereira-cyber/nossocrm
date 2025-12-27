# NossoCRM (Next.js + Supabase)

CRM multi-tenant com foco em produtividade (pipeline/boards, contatos, atividades, inbox) e recursos de I.A. integrados. O frontend e o backend (Route Handlers) vivem no mesmo projeto Next.js.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/thaleslaray/nossocrm&teamSlug=thaleslaray)

> Quer importar um repositório diferente? Use: `https://vercel.com/new?teamSlug=thaleslaray`

## Stack

- **Next.js (App Router)**: UI, páginas protegidas e APIs em `app/api/*`
- **React 19** + **TypeScript**
- **Supabase**: auth, Postgres e realtime
- **TanStack Query**: cache e mutations
- **Tailwind CSS** + Radix UI: UI e componentes base

## Estrutura do projeto (visão rápida)

- `app/`: rotas (UI) e `app/api/*` (Route Handlers)
  - `app/(protected)/`: páginas que exigem sessão
  - `app/install/*`: fluxo de instalação/provisionamento
- `features/`: páginas e componentes por domínio (boards, contatos, inbox, settings, etc.)
- `components/`: componentes compartilhados (UI, modais, charts, etc.)
- `lib/`: infra e integrações (Supabase, AI, segurança, query, realtime, utils)
- `context/`: contexts globais do app (CRM, AI, settings, etc.)
- `hooks/`: hooks reutilizáveis (fora de `features/`)
- `services/`: camada de serviços (quando aplicável)
- `supabase/`: migrações e scripts SQL
- `docs/`: documentação do projeto

## Pré-requisitos

- **Node.js** (recomendado: versão LTS recente)
- **npm** (ou outro gerenciador, mas este repo usa `package-lock.json`)

## Setup local

1) Instale dependências:

```bash
npm install
```

2) Configure variáveis de ambiente:

- Use o arquivo `.env.example` como base
- Copie para `.env.local`
- Preencha:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (necessário para scripts/rotas server-side específicas)

Por segurança, **não** comite `.env.local`.

3) Rode o servidor:

```bash
npm run dev
```

Abra `http://localhost:3000`.

## Scripts

- `npm run dev`: roda o app em modo dev
- `npm run build`: build de produção
- `npm run start`: inicia o servidor após build
- `npm run lint`: eslint (com `--max-warnings 0`)
- `npm run typecheck`: TypeScript sem emitir arquivos
- `npm run test` / `npm run test:run`: vitest

## Installer (ops)

Este repo possui um instalador para provisionar **Vercel + Supabase** via UI:

- Se `INSTALLER_ENABLED` não existir, o instalador fica liberado até a primeira instalação
- Para bloquear manualmente, defina `INSTALLER_ENABLED=false` (ou use `INSTALLER_TOKEN`)
- Acesse `/install` (redireciona para `/install/start`)
- Informe:
  - Vercel PAT (o projeto é detectado automaticamente)
  - credenciais do Supabase (incluindo DB URL)

Ao finalizar, o instalador grava `INSTALLER_ENABLED=false` nas envs do projeto.

## Rotas de teste de I.A (apenas dev)

Este projeto contém rotas internas para testar a integração de I.A:

- `POST /api/ai/test`
- `GET /ai-test`

Por segurança, ambas ficam desativadas por padrão e só funcionam em desenvolvimento quando:

- `ALLOW_AI_TEST_ROUTE=true`

Recomendação: habilitar **apenas localmente** via `.env.local` e nunca em produção.

## Proxy (Next 16+) — padrão do projeto

Este projeto usa **Next.js Proxy** via o arquivo `proxy.ts` na raiz.

> No Next.js 16+, a convenção `middleware.ts` foi renomeada/deprecada em favor de `proxy.ts`.

Referência: `https://nextjs.org/docs/app/api-reference/file-conventions/proxy`

Notas rápidas:

- Só existe **um** `proxy.ts` por projeto; use `config.matcher` para limitar onde roda.
- Neste repo, o `proxy.ts` **não intercepta** `/api/*` (Route Handlers devem responder com 401/403). Isso evita redirects 307 para `/login` quebrando `fetch`/SDKs.

Importante: aqui “Proxy” é uma feature do Next. Não confundir com as rotas internas de IA (ex.: `/api/ai/chat` e `/api/ai/tasks/*`).

## Permissões (RBAC)

- Consulte `docs/security/RBAC.md` (papéis **admin** e **vendedor** e o que cada um pode/não pode fazer).

## Integrações (Webhooks)

- Guia de uso (configuração, payloads, exemplos e troubleshooting): `docs/webhooks.md`

## Documentação de código (JSDoc)

Este repo mantém docstrings em **pt-BR** no padrão **JSDoc** para itens públicos/exportados.

- Para (re)gerar JSDoc automaticamente:

```bash
node scripts/add-jsdoc.mjs
```

O script evita sobrescrever docstrings existentes e tenta descrever `@param`/`@returns` com base em tipos e heurísticas comuns.

## Deploy

O caminho natural é **Vercel** (Next.js) + **Supabase** (DB/Auth/Realtime). O instalador (`/install`) também automatiza parte desse provisionamento quando habilitado.
