# Nikson Rotondaro — Portfolio

Portfólio de Nikson Rotondaro — Full Stack Software Engineer.

**Site:** [nikson.dev](https://www.nikson.dev)

## Stack

- [React Router v7](https://reactrouter.com/) (SSR)
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Framer Motion](https://www.framer.com/motion/)
- [Vercel](https://vercel.com) (deploy) + Analytics & Speed Insights
- Google Tag Manager

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
