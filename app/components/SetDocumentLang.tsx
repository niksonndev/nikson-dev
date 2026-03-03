import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export function SetDocumentLang() {
  const { i18n } = useTranslation();
  useEffect(() => {
    const lang = i18n.language?.slice(0, 2) ?? "en";
    const localeMap: Record<string, string> = {
      en: "en",
      es: "es",
      pt: "pt-BR",
    };
    document.documentElement.lang = localeMap[lang] ?? lang;
  }, [i18n.language]);
  return null;
}
