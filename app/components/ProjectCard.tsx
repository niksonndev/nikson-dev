import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";

export type ProjectCardProps = {
  title: string;
  description: string;
  tags: string[];
  liveUrl?: string;
  githubUrl?: string;
  analyticsIntegrated?: boolean;
};

export function ProjectCard({
  title,
  description,
  tags,
  liveUrl,
  githubUrl,
  analyticsIntegrated = false,
}: ProjectCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="group relative rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-zinc-700 hover:bg-zinc-900/80"
    >
      {analyticsIntegrated && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30">
          <BarChart3 className="size-3.5" aria-hidden />
          Analytics Integrated
        </span>
      )}
      <h3
        className={`text-lg font-semibold text-zinc-100 ${
          analyticsIntegrated ? "pr-32" : ""
        }`}
      >
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        {description}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-400"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        {liveUrl && (
          <a
            href={liveUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-zinc-300 underline decoration-zinc-600 underline-offset-2 transition hover:text-zinc-100 hover:decoration-zinc-400"
          >
            Live Demo
          </a>
        )}
        {githubUrl && (
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-zinc-300 underline decoration-zinc-600 underline-offset-2 transition hover:text-zinc-100 hover:decoration-zinc-400"
          >
            GitHub
          </a>
        )}
      </div>
    </motion.article>
  );
}
