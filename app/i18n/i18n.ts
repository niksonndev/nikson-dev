import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";

const resources = {
  en: { translation: en },
  es: { translation: es },
  pt: { translation: pt },
};

export const supportedLngs = ["en", "es", "pt"] as const;
export type SupportedLng = (typeof supportedLngs)[number];

const isClient = typeof window !== "undefined";

i18n.use(initReactI18next);
if (isClient) {
  i18n.use(LanguageDetector);
}

i18n.init({
  resources,
  fallbackLng: "en",
  supportedLngs: [...supportedLngs],
  interpolation: {
    escapeValue: false,
  },
  ...(isClient && {
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
  }),
});

export default i18n;
