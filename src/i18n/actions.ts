"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { locales, type Locale } from "./config";

export async function setLocaleCookie(next: Locale) {
  if (!(locales as readonly string[]).includes(next)) return;
  const store = await cookies();
  store.set("locale", next, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
