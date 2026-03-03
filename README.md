# Nikson Rotondaro — Portfolio

Portfólio de Nikson Rotondaro: Front-end Engineer com foco em E-commerce de alta performance e Web Analytics.

**Site:** [nikson.dev](https://www.nikson.dev) *(atualize com sua URL em produção)*

## Stack

- [React Router v7](https://reactrouter.com/) (SSR)
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Framer Motion](https://www.framer.com/motion/)
- [Vercel](https://vercel.com) (deploy) + Analytics & Speed Insights
- Google Tag Manager (opcional, via `VITE_GTM_ID`)

## Como rodar

### Instalação

```bash
pnpm install
```

### Desenvolvimento

```bash
pnpm dev
```

Aplicação em `http://localhost:5173`.

### Build de produção

```bash
pnpm build
```

### Scripts

| Comando           | Descrição                    |
|-------------------|-----------------------------|
| `pnpm dev`        | Servidor de desenvolvimento |
| `pnpm build`      | Build de produção           |
| `pnpm start`      | Servidor de produção        |
| `pnpm typecheck`  | Gera tipos e roda TypeScript|
| `pnpm lint`       | ESLint                      |
| `pnpm format`     | Prettier                    |

## Deploy (Vercel)

O projeto está configurado para a Vercel com o preset `@vercel/react-router`. Ao conectar o repositório:

- **Build Command:** `pnpm build`
- **Install Command:** `pnpm install`
- **Output:** detectado automaticamente pelo preset.

### Variáveis de ambiente

| Variável        | Obrigatória | Descrição                                    |
|-----------------|-------------|----------------------------------------------|
| `VITE_GTM_ID`   | Não         | ID do container GTM (ex.: GTM-XXX)          |
| `VITE_SITE_URL` | Não         | URL canônica do site (ex.: https://www.nikson.dev) |

Copie `.env.example` para `.env` e preencha conforme necessário.

## Estrutura

```
├── app/
│   ├── components/   # Footer, ProjectCard, GoogleTagManager
│   ├── routes/       # Rotas (home)
│   ├── app.css       # Estilos globais + Tailwind
│   └── root.tsx      # Layout, meta, links
├── public/           # Assets estáticos (favicon, robots.txt)
├── react-router.config.ts
├── vite.config.ts
└── package.json
```

## Licença

MIT
