// scripts/download-idf-pdn.mjs
import fs from "node:fs/promises";
import path from "node:path";

const START_URLS = [
  "https://idf64.org/",
  "https://idf64.org/tables-of-draw/",
  "https://idf64.org/events/",
  "https://idf64.org/documents/",
];

const OUT_DIR = "data/pdn/idf64";
const MANIFEST = "data/pdn/idf64-manifest.json";
const COMBINED = "data/pdn/idf64-combined.pdn";

const MAX_PAGES = 250;
const DELAY_MS = 700;
const TIMEOUT_MS = 20000;

await fs.mkdir(OUT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeNameFromUrl(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .slice(0, 180);
}

async function fetchBuffer(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "DamaDojo research downloader; educational project",
        "Accept": "*/*",
      },
    });

    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: res.ok, status: res.status, buf, contentType: res.headers.get("content-type") ?? "" };
  } finally {
    clearTimeout(t);
  }
}

function absolutize(href, base) {
  try {
    return new URL(href.replaceAll("&amp;", "&"), base).toString();
  } catch {
    return null;
  }
}

function extractLinks(html, baseUrl) {
  const links = new Set();
  const re = /href=["']([^"']+)["']/gi;
  let m;

  while ((m = re.exec(html))) {
    const abs = absolutize(m[1], baseUrl);
    if (!abs) continue;

    const u = new URL(abs);
    if (!["idf64.org", "fmjd64.org"].includes(u.hostname)) continue;

    links.add(abs.split("#")[0]);
  }

  return [...links];
}

function isAssetUrl(url) {
  return /\.(pdn|zip|rar|7z|txt)$/i.test(new URL(url).pathname);
}

function isPageUrl(url) {
  const pathname = new URL(url).pathname;
  return !/\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|css|js|ico|svg)$/i.test(pathname);
}

function countGames(text) {
  return (text.match(/\[Event\s+"/g) ?? []).length;
}

const queue = [...START_URLS];
const seenPages = new Set();
const seenAssets = new Set();
const manifest = [];
let combined = "";

while (queue.length && seenPages.size < MAX_PAGES) {
  const pageUrl = queue.shift();
  if (seenPages.has(pageUrl)) continue;
  seenPages.add(pageUrl);

  console.log(`PAGE ${seenPages.size}: ${pageUrl}`);

  let page;
  try {
    page = await fetchBuffer(pageUrl);
  } catch (e) {
    console.log(`  ERR page ${String(e).slice(0, 120)}`);
    continue;
  }

  if (!page.ok) {
    console.log(`  HTTP ${page.status}`);
    continue;
  }

  const html = page.buf.toString("utf8");
  const links = extractLinks(html, pageUrl);

  for (const link of links) {
    if (isAssetUrl(link)) {
      seenAssets.add(link);
    } else if (isPageUrl(link) && !seenPages.has(link) && queue.length < MAX_PAGES * 3) {
      queue.push(link);
    }
  }

  await sleep(DELAY_MS);
}

console.log(`Found candidate assets: ${seenAssets.size}`);

for (const url of seenAssets) {
  console.log(`ASSET: ${url}`);

  try {
    const r = await fetchBuffer(url);
    if (!r.ok) {
      manifest.push({ url, ok: false, status: r.status });
      continue;
    }

    const ext = path.extname(new URL(url).pathname).toLowerCase() || ".bin";
    const filename = safeNameFromUrl(url);
    const file = path.join(OUT_DIR, filename);

    await fs.writeFile(file, r.buf);

    let games = 0;
    if (ext === ".pdn" || ext === ".txt") {
      const text = r.buf.toString("utf8");
      games = countGames(text);
      if (games > 0) combined += `\n\n; ===== ${url} =====\n\n${text.trim()}\n`;
    }

    manifest.push({
      url,
      ok: true,
      status: r.status,
      contentType: r.contentType,
      bytes: r.buf.length,
      games,
      file,
    });
  } catch (e) {
    manifest.push({ url, ok: false, status: "ERR", error: String(e) });
  }

  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
  await fs.writeFile(COMBINED, combined.trim() + "\n", "utf8");

  await sleep(DELAY_MS);
}

console.log("DONE IDF");
console.log(`Manifest: ${MANIFEST}`);
console.log(`Combined PDN: ${COMBINED}`);