function normalizeSearch(search: string): string {
  if (!search) return "";
  return search.startsWith("?") ? search : `?${search}`;
}

export function isSidebarItemActive(
  href: string,
  pathname: string,
  search = "",
): boolean {
  const target = new URL(href, "http://damadojo.local");
  const currentSearch = normalizeSearch(search);

  if (target.search) {
    return pathname === target.pathname && currentSearch === target.search;
  }

  if (target.pathname === "/play") return pathname === "/play";

  return pathname === target.pathname || pathname.startsWith(`${target.pathname}/`);
}
