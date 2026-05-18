export const locales = ["ru", "en", "kk"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ru";

export const localeLabels: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
  kk: "Қазақша",
};

export const localeShortLabels: Record<Locale, string> = {
  ru: "RU",
  en: "EN",
  kk: "KZ",
};
