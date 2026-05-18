import fs from "node:fs/promises";
import path from "node:path";
import https from "node:https";
import http from "node:http";

const START_URLS = [
  "https://idf64.org/",
  "https://idf64.org/tables-of-draw/",
  "https://idf64.org/events/",
  "https://idf64.org/category/games/",
];

const OUT_DIR = "data/pdn/idf64/assets";
const MANIFEST = "data/pdn/idf64/manifest.json";

const MAX_PAGES = 300;
const DELAY_MS = 800;

await fs.mkdir(OUT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeName(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .slice(0, 180);
}

function getBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;

    const req = lib.get(url, {
      headers: {
        "User-Agent": "DamaDojo/0.1 educational IDF archive crawler",
        "Accept": "*/*",
      },
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        resolve(getBuffer(next));
        return;
      }

      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          contentType: res.headers["content-type"] || "",
          buffer: Buffer.concat(chunks),
          url,
        });
      });
    });

    req.setTimeout(120000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

function extractLinks(html, base) {
  const links = new Set();
  const re = /href=["']([^"']+)["']/gi;
  let m;

  while ((m = re.exec(html))) {
    try {
      const abs = new URL(m[1].replaceAll("&amp;", "&"), base).toString();
      const host = new URL(abs).hostname;
      if (host === "idf64.org" || host.endsWith(".idf64.org")) {
        links.add(abs.split("#")[0]);
      }
    } catch {}
  }

  return [...links];
}

function isAsset(url) {
  const p = new URL(url).pathname.toLowerCase();
  return /\.(pdn|zip|rar|7z|txt|xlsx|xls|pdf|doc|docx)$/i.test(p);
}

function isPage(url) {
  const p = new URL(url).pathname.toLowerCase();
  return !/\.(jpg|jpeg|png|gif|webp|svg|css|js|ico)$/i.test(p) && !isAsset(url);
}

const queue = [...START_URLS];
const seenPages = new Set();
const assets = new Set();
const manifest = [];

while (queue.length && seenPages.size < MAX_PAGES) {
  const url = queue.shift();
  if (seenPages.has(url)) continue;
  seenPages.add(url);

  console.log(`PAGE ${seenPages.size}: ${url}`);

  try {
    const r = await getBuffer(url);
    if (r.status !== 200) continue;

    const html = r.buffer.toString("utf8");
    const links = extractLinks(html, url);

    for (const link of links) {
      if (isAsset(link)) assets.add(link);
      else if (isPage(link) && !seenPages.has(link) && queue.length < MAX_PAGES * 5) {
        queue.push(link);
      }
    }
  } catch (e) {
    console.log(`  ERR ${String(e.message || e)}`);
  }

  await sleep(DELAY_MS);
}

console.log(`Found assets: ${assets.size}`);

for (const url of assets) {
  console.log(`ASSET ${url}`);

  try {
    const r = await getBuffer(url);
    const filename = safeName(url);
    const file = path.join(OUT_DIR, filename);

    if (r.status >= 200 && r.status < 300) {
      await fs.writeFile(file, r.buffer);
      manifest.push({
        ok: true,
        url,
        status: r.status,
        contentType: r.contentType,
        bytes: r.buffer.length,
        file,
      });
    } else {
      manifest.push({
        ok: false,
        url,
        status: r.status,
      });
    }
  } catch (e) {
    manifest.push({
      ok: false,
      url,
      error: String(e.message || e),
    });
  }

  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
  await sleep(DELAY_MS);
}

console.log("DONE");
console.log(`Manifest: ${MANIFEST}`);