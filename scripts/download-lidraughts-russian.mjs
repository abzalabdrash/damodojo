import fs from "node:fs/promises";
import path from "node:path";

const BASE = "https://lidraughts.org";

const ROOT = "data/pdn/lidraughts-russian";
const OUT_DIR = `${ROOT}/users`;
const COMBINED = `${ROOT}/combined.pdn`;
const MANIFEST = `${ROOT}/manifest.json`;
const FAILED = `${ROOT}/failed.json`;

const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 500);
const MAX_GAMES = Number(process.env.MAX_GAMES || 200);
const DELAY_MS = Number(process.env.DELAY_MS || 3000);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 60000);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 5);
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS || 4000);
const RETRY_MAX_MS = Number(process.env.RETRY_MAX_MS || 45000);
const RATE_LIMIT_COOLDOWN_MS = Number(process.env.RATE_LIMIT_COOLDOWN_MS || 90000);
// Only counts network/server errors — "0 games" responses don't count
const CONSECUTIVE_NET_FAIL_STOP = Number(process.env.CONSECUTIVE_NET_FAIL_STOP || 10);

await fs.mkdir(OUT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFileName(s) {
  return s.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 90);
}

function countGames(text) {
  return (text.match(/\[Event\s+"/g) || []).length;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(file) {
  try {
    const value = JSON.parse(await fs.readFile(file, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

async function writeTextAtomic(file, value) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, value, "utf8");
  await fs.rename(tmp, file);
}

function endpointUrls(username) {
  const u = encodeURIComponent(username);

  const common = {
    max: String(MAX_GAMES),
    moves: "true",
    tags: "true",
    clocks: "false",
    evals: "false",
    sort: "dateDesc",
    finished: "true",
  };

  const byPerf = new URLSearchParams({ ...common, perfType: "russian" });
  const byVariant = new URLSearchParams({ ...common, variant: "russian" });

  return [
    `${BASE}/api/games/user/${u}?${byPerf.toString()}`,
    `${BASE}/api/games/user/${u}?${byVariant.toString()}`,
  ];
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    error?.name === "AbortError" ||
    message.includes("fetch failed") ||
    message.includes("terminated") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("socket") ||
    message.includes("network")
  );
}

function retryDelay(attempt, status) {
  if (status === 429) return RATE_LIMIT_COOLDOWN_MS;
  const exp = RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 1000);
  return Math.min(RETRY_MAX_MS, exp + jitter);
}

async function fetchOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "DamaDojo/0.1 educational PDN downloader",
        Accept: "application/x-draughts-pdn,text/plain,text/html,*/*",
      },
    });

    const text = await response.text();
    return {
      status: response.status,
      text,
      contentType: response.headers.get("content-type") || "",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithRetries(url) {
  let lastError = null;
  let lastStatus = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fetchOnce(url);
      lastStatus = result.status;

      if (result.status === 200 || !isRetryableStatus(result.status)) {
        return { ...result, attempts: attempt, retryable: isRetryableStatus(result.status) };
      }

      lastError = new Error(`HTTP ${result.status}`);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error)) {
        return {
          status: "ERR",
          text: "",
          contentType: "",
          attempts: attempt,
          retryable: false,
          error: String(error?.message || error),
        };
      }
    }

    if (attempt < MAX_RETRIES) {
      const waitMs = retryDelay(attempt, lastStatus);
      process.stdout.write(`retry ${attempt}/${MAX_RETRIES} in ${Math.round(waitMs / 1000)}s; `);
      await sleep(waitMs);
    }
  }

  return {
    status: lastStatus || "ERR",
    text: "",
    contentType: "",
    attempts: MAX_RETRIES,
    retryable: true,
    error: String(lastError?.message || lastError || "fetch failed"),
  };
}

async function getTopRussianPlayers(manifest) {
  const url = `${BASE}/player/top/${MAX_PLAYERS}/russian`;
  const { status, text, error } = await fetchTextWithRetries(url);

  if (status !== 200) {
    const fallback = manifest
      .filter((entry) => entry.username)
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.username);
    const uniqueFallback = [...new Set(fallback)].slice(0, MAX_PLAYERS);

    if (uniqueFallback.length > 0) {
      console.log(
        `Leaderboard unavailable (${status} ${error || ""}); using ${uniqueFallback.length} users from manifest`
      );
      return uniqueFallback;
    }

    throw new Error(`Leaderboard HTTP ${status} ${error || ""}`.trim());
  }

  const players = [];
  const re = /href="\/@\/([^"]+)"/g;
  let match;

  while ((match = re.exec(text))) {
    const username = decodeURIComponent(match[1]).trim();
    if (username && !players.includes(username)) players.push(username);
  }

  if (players.length === 0) throw new Error("Parsed 0 players from leaderboard");
  return players.slice(0, MAX_PLAYERS);
}

function currentFileFor(rank, username) {
  return path.join(OUT_DIR, `${String(rank).padStart(3, "0")}_${safeFileName(username)}.pdn`);
}

async function validExistingFile(file) {
  if (!file || !(await exists(file))) return null;
  const text = await fs.readFile(file, "utf8");
  const games = countGames(text);
  return games > 0 ? { file, games, bytes: Buffer.byteLength(text, "utf8") } : null;
}

async function findExistingDownload(manifest, rank, username) {
  const previous = manifest.find((entry) => entry.username === username && entry.ok && entry.games > 0);
  const previousFile = await validExistingFile(previous?.file);
  if (previousFile) return previousFile;

  return validExistingFile(currentFileFor(rank, username));
}

async function downloadOne(username, file) {
  for (const url of endpointUrls(username)) {
    const result = await fetchTextWithRetries(url);

    if (result.status !== 200) {
      // Network / server error — keep trying next endpoint
      continue;
    }

    const games = countGames(result.text);

    if (games > 0) {
      // Valid PDN — no [GameType] requirement, game count is enough
      await writeTextAtomic(file, result.text.trim() + "\n\n");
      return {
        ok: true,
        status: result.status,
        games,
        bytes: Buffer.byteLength(result.text, "utf8"),
        contentType: result.contentType,
        url,
        attempts: result.attempts,
        networkError: false,
        noGames: false,
      };
    }

    // HTTP 200 but 0 games — player has no Russian variant games
    return {
      ok: false,
      networkError: false,
      noGames: true,
      status: result.status,
      error: "0 games (player has no Russian variant games)",
      url,
      attempts: result.attempts,
    };
  }

  // All endpoints failed with network/server errors
  return {
    ok: false,
    networkError: true,
    noGames: false,
    status: "ERR",
    error: "all endpoints failed with network/server errors",
    url: endpointUrls(username).at(-1),
    attempts: endpointUrls(username).length * MAX_RETRIES,
  };
}

async function combineAll() {
  const files = (await fs.readdir(OUT_DIR)).filter((name) => name.endsWith(".pdn")).sort();

  let combined = "";
  for (const name of files) {
    const file = path.join(OUT_DIR, name);
    const text = await fs.readFile(file, "utf8");
    combined += `\n\n; ===== ${name} =====\n\n${text.trim()}\n`;
  }

  await writeTextAtomic(COMBINED, combined.trim() + "\n");
  return countGames(combined);
}

function upsertManifest(manifest, entry) {
  return [...manifest.filter((item) => item.username !== entry.username), entry].sort(
    (a, b) => a.rank - b.rank
  );
}

async function persist(manifest) {
  const failed = manifest.filter((entry) => !entry.ok).sort((a, b) => a.rank - b.rank);
  await writeJsonAtomic(MANIFEST, manifest.sort((a, b) => a.rank - b.rank));
  await writeJsonAtomic(FAILED, failed);
}

async function main() {
  let manifest = await readJsonIfExists(MANIFEST);
  const players = await getTopRussianPlayers(manifest);

  console.log(`Parsed ${players.length} Russian top players`);
  console.log(`Max games per player: ${MAX_GAMES}`);
  console.log(`Retries per endpoint: ${MAX_RETRIES}`);
  console.log(`Stop after consecutive network failures: ${CONSECUTIVE_NET_FAIL_STOP}`);
  console.log("");

  // Pre-clean manifest: entries with attempts=0 and ok=false were never actually tried.
  // Remove them so the script will attempt them fresh.
  const neverTried = manifest.filter((e) => !e.ok && !e.attempts).length;
  if (neverTried > 0) {
    manifest = manifest.filter((e) => e.ok || e.attempts > 0);
    console.log(`Cleared ${neverTried} stale "never-attempted" entries from manifest.`);
    await persist(manifest);
  }

  let consecutiveNetFailures = 0;

  for (let i = 0; i < players.length; i++) {
    const username = players[i];
    const rank = i + 1;
    const file = currentFileFor(rank, username);

    const existing = await findExistingDownload(manifest, rank, username);
    if (existing) {
      process.stdout.write(`[${rank}/${players.length}] ${username} ... SKIP (${existing.games} games)\n`);
      manifest = upsertManifest(manifest, {
        rank,
        username,
        ok: true,
        games: existing.games,
        bytes: existing.bytes,
        file: existing.file,
        sourceUrl: manifest.find((e) => e.username === username)?.sourceUrl,
        resumed: true,
      });
      consecutiveNetFailures = 0;
      await persist(manifest);
      continue;
    }

    // Skip players previously confirmed to have 0 games — no point retrying
    const prev = manifest.find((e) => e.username === username);
    if (prev && !prev.ok && prev.noGames) {
      process.stdout.write(`[${rank}/${players.length}] ${username} ... SKIP (no Russian games)\n`);
      continue;
    }

    process.stdout.write(`[${rank}/${players.length}] ${username} ... `);

    const result = await downloadOne(username, file);

    if (result.ok) {
      console.log(`OK ${result.games} games (${result.attempts} attempts)`);
      manifest = upsertManifest(manifest, {
        rank,
        username,
        ok: true,
        games: result.games,
        bytes: result.bytes,
        file,
        sourceUrl: result.url,
        contentType: result.contentType,
        attempts: result.attempts,
      });
      consecutiveNetFailures = 0;
    } else if (result.noGames) {
      console.log(`SKIP 0 games`);
      manifest = upsertManifest(manifest, {
        rank,
        username,
        ok: false,
        games: 0,
        noGames: true,
        status: result.status,
        error: result.error,
        sourceUrl: result.url,
        attempts: result.attempts,
      });
      // Don't count 0-games as a network failure
    } else {
      console.log(`FAIL ${result.status} (${result.attempts || 0} attempts) ${result.error || ""}`);
      manifest = upsertManifest(manifest, {
        rank,
        username,
        ok: false,
        games: 0,
        noGames: false,
        status: result.status,
        error: result.error,
        sourceUrl: result.url,
        attempts: result.attempts,
      });
      consecutiveNetFailures++;
    }

    await persist(manifest);

    if (consecutiveNetFailures >= CONSECUTIVE_NET_FAIL_STOP) {
      console.log("");
      console.log(
        `Stopping after ${consecutiveNetFailures} consecutive network failures. Rerun to resume.`
      );
      break;
    }

    await sleep(DELAY_MS);
  }

  console.log("\nBuilding combined.pdn...");
  const totalGames = await combineAll();
  const okPlayers = manifest.filter((e) => e.ok && e.games > 0).length;
  const noGamesPlayers = manifest.filter((e) => !e.ok && e.noGames).length;
  const netFailPlayers = manifest.filter((e) => !e.ok && !e.noGames).length;
  const totalBytes = manifest.reduce((sum, e) => sum + (e.bytes || 0), 0);

  console.log("");
  console.log("DONE");
  console.log(`Players OK:           ${okPlayers}/${players.length}`);
  console.log(`Players (0 games):    ${noGamesPlayers}`);
  console.log(`Players (net errors): ${netFailPlayers}`);
  console.log(`Total games:          ${totalGames}`);
  console.log(`Approx PDN bytes:     ${totalBytes}`);
  console.log(`Combined:             ${COMBINED}`);
  console.log(`Manifest:             ${MANIFEST}`);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
