import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

import type { Route } from "./+types/root";
import { GoogleTagManagerBody, GoogleTagManagerHead } from "~/components/GoogleTagManager";
import "./app.css";

export const links: Route.LinksFunction = () => [
  {
    rel: "icon",
    type: "image/svg+xml",
    href: "/icon.svg",
  },
  {
    rel: "apple-touch-icon",
    href: "/apple-touch-icon.png",
  },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#18181b" />
        <Meta />
        <Links />
        <GoogleTagManagerHead />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-zinc-100 focus:px-3 focus:py-2 focus:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          Pular para o conteúdo
        </a>
        <GoogleTagManagerBody />
        {children}
        <Analytics />
        <SpeedInsights />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Erro";
    details =
      error.status === 404
        ? "A página solicitada não foi encontrada."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main
      role="alert"
      className="min-h-screen bg-zinc-950 px-4 py-16 font-sans text-zinc-100"
    >
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">{message}</h1>
        <p className="mt-2 text-zinc-400">{details}</p>
        {stack && (
          <pre className="mt-6 w-full overflow-x-auto rounded-lg bg-zinc-900 p-4 text-sm text-zinc-400">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
