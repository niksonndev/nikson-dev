import { motion } from "framer-motion";
import type { Route } from "./+types/home";
import { Footer } from "~/components/Footer";
import { ProjectCard } from "~/components/ProjectCard";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Nikson Rotondaro · Front-end Engineer & Web Analytics" }];
}

const container = {
  hidden: { opacity: 0 },
  visible: (i = 1) => ({
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
  return (
    <>
      <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 font-sans px-4">
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
            Hi, I'm Nikson Rotondaro
          </motion.h1>
          <motion.p
            variants={item}
            className="mt-4 text-lg text-zinc-400 md:text-xl leading-relaxed"
          >
            Front-end Engineer specializing in high-performance E-commerce &
            Web Analytics.
          </motion.p>
          <motion.div
            variants={item}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <a
              href="#projects"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-zinc-950"
            >
              View Projects
            </a>
            <a
              href="https://www.linkedin.com/in/nikson-rotondaro"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-600 px-5 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800/50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
            >
              LinkedIn
            </a>
          </motion.div>
        </motion.div>
      </main>
      <section
        id="projects"
        className="bg-zinc-950 font-sans px-4 py-16 md:py-24"
        aria-label="Projects"
      >
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold text-zinc-100 md:text-3xl">
            Projects
          </h2>
          <p className="mt-2 text-zinc-400">
            Selected work in e-commerce and web analytics.
          </p>
          <ul className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            <li>
              <ProjectCard
                title="Shopify Checkout Tracking"
                description="Optimized Shopify checkout tracking with server-side events and GTM data layer for accurate conversion and funnel metrics."
                tags={["React", "GTM", "Liquid", "TypeScript"]}
                liveUrl="#"
                githubUrl="#"
                analyticsIntegrated
              />
            </li>
            <li>
              <ProjectCard
                title="E-commerce Dashboard"
                description="Real-time dashboard for product performance and attribution, with custom dimensions and BigQuery export."
                tags={["React", "TypeScript", "GTM", "GA4"]}
                liveUrl="#"
                githubUrl="#"
                analyticsIntegrated
              />
            </li>
            <li>
              <ProjectCard
                title="Landing Page Builder"
                description="Modular landing pages with A/B test integration and event tracking for form submissions and CTA clicks."
                tags={["React", "TypeScript", "Vite"]}
                liveUrl="#"
                githubUrl="#"
              />
            </li>
            <li>
              <ProjectCard
                title="Data Layer Library"
                description="Reusable data layer utilities for e-commerce events (view_item, add_to_cart, purchase) with TypeScript types."
                tags={["TypeScript", "GTM", "GA4"]}
                githubUrl="#"
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
