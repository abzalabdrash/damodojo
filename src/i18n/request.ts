import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, locales, type Locale } from "./config";

function pickLocale(value: string | undefined): Locale {
  if (!value) return defaultLocale;
  return (locales as readonly string[]).includes(value)
    ? (value as Locale)
    : defaultLocale;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  let locale = pickLocale(cookieStore.get("locale")?.value);

  // Fallback to Accept-Language header if no cookie
  if (!cookieStore.get("locale")?.value) {
    const headerList = await headers();
    const acceptLang = headerList.get("accept-language") || "";
    if (acceptLang.startsWith("kk")) locale = "kk";
    else if (acceptLang.startsWith("en")) locale = "en";
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
    timeZone: "Asia/Almaty",
  };
});
