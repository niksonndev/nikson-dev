import { useTranslation } from "react-i18next";

export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-zinc-100 focus:px-3 focus:py-2 focus:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-400"
    >
      {t("a11y.skipToContent")}
    </a>
  );
}
