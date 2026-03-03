import { motion } from "framer-motion";
import type { Route } from "./+types/home";
import { Footer } from "~/components/Footer";
import { ProjectCard } from "~/components/ProjectCard";
import { useTranslation } from "react-i18next";

const SITE_URL = import.meta.env.VITE_SITE_URL ?? "https://www.nikson.dev";
const TITLE = "Nikson Rotondaro · Front-end Engineer & Web Analytics";
const DESCRIPTION =
  "Nikson Rotondaro — Front-end Engineer specializing in high-performance E-commerce and Web Analytics. Portfolio with projects in React, Next.js, Shopify, GTM and real-time applications.";

export function meta(_: Route.MetaArgs) {
  return [
    { title: TITLE },
    { name: "description", content: DESCRIPTION },
    { property: "og:type", content: "website" },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: DESCRIPTION },
    { property: "og:url", content: SITE_URL },
    { property: "og:locale", content: "pt_BR" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: TITLE },
    { name: "twitter:description", content: DESCRIPTION },
  ];
}

const container = {
  hidden: { opacity: 0 },
  visible: (_ = 1) => ({
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  }),
};

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};

export default function Home() {
  const { t } = useTranslation();
  return (
    <>
      <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 font-sans px-4" id="main-content">
        <motion.div
          className="flex flex-col items-center justify-center text-center max-w-2xl"
          variants={container}
          initial="hidden"
          animate="visible"
        >
          <motion.h1
            variants={item}
            className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl text-zinc-100"
          >
            {t("hero.title")}
          </motion.h1>
          <motion.p
            variants={item}
            className="mt-4 text-lg text-zinc-400 md:text-xl leading-relaxed"
          >
            {t("hero.subtitle")}
          </motion.p>
          <motion.div
            variants={item}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <a
              href="#projects"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-zinc-950"
            >
              {t("hero.viewProjects")}
            </a>
            <a
              href="https://www.linkedin.com/in/nikson-rotondaro"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-600 px-5 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800/50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
            >
              {t("hero.linkedin")}
            </a>
          </motion.div>
        </motion.div>
      </main>
      <section
        id="projects"
        className="bg-zinc-950 font-sans px-4 py-16 md:py-24"
        aria-label={t("projects.title")}
      >
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold text-zinc-100 md:text-3xl">
            {t("projects.title")}
          </h2>
          <p className="mt-2 text-zinc-400">
            {t("projects.subtitle")}
          </p>
          <ul className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            <li>
              <ProjectCard
                title={t("projects.zenithDrones.title")}
                description={t("projects.zenithDrones.description")}
                tags={[
                  "Next.js 15",
                  "React 19",
                  "TypeScript",
                  "Postgres",
                  "Prisma",
                  "Stripe",
                  "Zustand",
                  "Tailwind CSS 4",
                ]}
                liveUrl="https://zenith-drones.vercel.app/"
                githubUrl="https://github.com/niksonndev/zenith-drones"
                analyticsIntegrated
              />
            </li>
            <li>
              <ProjectCard
                title={t("projects.maceioCine.title")}
                description={t("projects.maceioCine.description")}
                tags={[
                  "Node.js",
                  "Telegram Bot API",
                  "Axios",
                  "Express",
                  "Docker",
                ]}
                liveUrl="https://t.me/MaceioCine_bot"
                githubUrl="https://github.com/niksonndev/maceio-cinema-bot"
              />
            </li>
            <li>
              <ProjectCard
                title={t("projects.discordClone.title")}
                description={t("projects.discordClone.description")}
                tags={[
                  "Next.js",
                  "React",
                  "TypeScript",
                  "Socket.io",
                  "Zustand",
                  "Tailwind CSS",
                ]}
                githubUrl="https://github.com/niksonndev/discord-clone"
              />
            </li>
            <li>
              <ProjectCard
                title={t("projects.shopifyBundle.title")}
                description={t("projects.shopifyBundle.description")}
                tags={[
                  "Shopify",
                  "Liquid",
                  "Alpine.js",
                  "Tailwind CSS",
                  "Shopify AJAX API",
                ]}
                githubUrl="https://github.com/niksonndev/shopify-advanced-bundle"
                analyticsIntegrated
              />
            </li>
          </ul>
        </div>
      </section>
      <Footer />
    </>
  );
}
