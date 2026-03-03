import { useTranslation } from "react-i18next";
import { supportedLngs, type SupportedLng } from "~/i18n/i18n";

const labels: Record<SupportedLng, string> = {
  en: "EN",
  es: "ES",
  pt: "PT",
};

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.language?.slice(0, 2) ?? "en") as SupportedLng;
  const lng = supportedLngs.includes(current) ? current : "en";

  return (
    <div className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900/50 p-1">
      {supportedLngs.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => i18n.changeLanguage(code)}
          className={`rounded-md px-2 py-1 text-xs font-medium transition ${
            lng === code
              ? "bg-zinc-700 text-zinc-100"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
          aria-pressed={lng === code}
          aria-label={`Language: ${labels[code]}`}
        >
          {labels[code]}
        </button>
      ))}
    </div>
  );
}
