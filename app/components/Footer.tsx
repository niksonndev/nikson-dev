export function Footer() {
  return (
    <footer
      className="border-t border-zinc-800 bg-zinc-950 font-sans"
      role="contentinfo"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-zinc-400 sm:flex-row">
        <a
          href="mailto:niksonndev@gmail.com"
          className="transition hover:text-zinc-100"
        >
          niksonndev@gmail.com
        </a>
        <div className="flex items-center gap-2">
          <span
            className="relative flex size-2"
            aria-hidden
          >
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <span>Available for projects</span>
        </div>
      </div>
    </footer>
  );
}
