import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Nikson Rotondaro · Front-end Engineer & Web Analytics" }];
}

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
        Nikson Rotondaro
      </h1>
      <p className="mt-3 text-lg text-zinc-400 md:text-xl">
        Front-end Engineer & Web Analytics
      </p>
    </main>
  );
}
