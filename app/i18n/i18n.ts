import i18n from "i18next";
import { initReactI18next } from "react-i18next";

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

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  supportedLngs: [...supportedLngs],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
