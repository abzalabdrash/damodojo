import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PDN_LIKE_RE = /\.(pdn|txt)$/i;
const SKIPPED_ASSET_RE = /\.(pdf|doc|docx|xls|xlsx|jpg|jpeg|png|gif|webp)$/i;

export function countGames(text) {
  return (text.match(/\[Event\s+"/g) || []).length;
}

export function filterPdnLikeEntries(entries) {
  return entries
    .map((entry) => entry.replaceAll("\\", "/"))
    .filter((entry) => PDN_LIKE_RE.test(entry) && !entry.endsWith("/"))
    .sort((a, b) => a.localeCompare(b));
}

export function safeOutputName(source, entry = "") {
  const stem = [source, entry]
    .filter(Boolean)
    .join("__")
    .replace(/^https?:\/\//, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);

  return stem || "pdn";
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeTextAtomic(file, value) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, value, "utf8");
  await fs.rename(tmp, file);
}

async function writeJsonAtomic(file, value) {
  await writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function listZipEntries(zipFile, tarCommand = "tar") {
  const { stdout } = await execFileAsync(tarCommand, ["-tf", zipFile], {
    maxBuffer: 1024 * 1024 * 20,
  });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function extractZipEntry(zipFile, entry, tempDir, tarCommand = "tar") {
  await ensureDir(tempDir);
  await execFileAsync(tarCommand, ["-xf", zipFile, "-C", tempDir, entry], {
    maxBuffer: 1024 * 1024 * 20,
  });

  return path.join(tempDir, entry);
}

async function readTextFile(file) {
  const buffer = await fs.readFile(file);
  return buffer.toString("utf8");
}

async function collectTextCandidate({ text, source, entry, filesDir }) {
  const games = countGames(text);

  if (games === 0) {
    return {
      file: null,
      manifest: {
        ok: false,
        source,
        entry,
        games: 0,
        reason: "no-games",
      },
    };
  }

  const outputName = `${safeOutputName(path.basename(source), entry)}.pdn`;
  const outputFile = path.join(filesDir, outputName);
  const normalizedText = text.trim() + "\n\n";

  await writeTextAtomic(outputFile, normalizedText);

  return {
    file: {
      source,
      entry,
      file: outputFile,
      games,
      bytes: Buffer.byteLength(normalizedText, "utf8"),
    },
    manifest: {
      ok: true,
      source,
      entry,
      file: outputFile,
      games,
      bytes: Buffer.byteLength(normalizedText, "utf8"),
    },
  };
}

async function collectDirectFile(assetFile, filesDir) {
  const text = await readTextFile(assetFile);
  return collectTextCandidate({
    text,
    source: assetFile,
    entry: "",
    filesDir,
  });
}

async function collectZipFile(assetFile, tempRoot, filesDir, tarCommand) {
  const manifest = [];
  const files = [];
  const entries = filterPdnLikeEntries(await listZipEntries(assetFile, tarCommand));
  const zipTemp = path.join(tempRoot, safeOutputName(path.basename(assetFile)));

  if (entries.length === 0) {
    return {
      files,
      manifest: [
        {
          ok: false,
          source: assetFile,
          games: 0,
          reason: "no-pdn-like-entries",
        },
      ],
    };
  }

  for (const entry of entries) {
    try {
      const extracted = await extractZipEntry(assetFile, entry, zipTemp, tarCommand);
      const text = await readTextFile(extracted);
      const result = await collectTextCandidate({
        text,
        source: assetFile,
        entry,
        filesDir,
      });

      if (result.file) files.push(result.file);
      manifest.push(result.manifest);
    } catch (error) {
      manifest.push({
        ok: false,
        source: assetFile,
        entry,
        games: 0,
        reason: "extract-error",
        error: String(error?.message || error),
      });
    }
  }

  return { files, manifest };
}

export async function collectIdf64Pdn(options = {}) {
  const assetsDir = options.assetsDir || "data/pdn/idf64/assets";
  const outputDir = options.outputDir || "data/pdn/idf64/extracted-pdn";
  const filesDir = options.filesDir || path.join(outputDir, "files");
  const tempRoot = options.tempDir || path.join(outputDir, ".tmp");
  const combinedFile = options.combinedFile || path.join(outputDir, "combined.pdn");
  const manifestFile = options.manifestFile || path.join(outputDir, "manifest.json");
  const tarCommand = options.tarCommand || "tar";

  await ensureDir(filesDir);
  await ensureDir(tempRoot);

  const entries = (await fs.readdir(assetsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(assetsDir, entry.name))
    .sort((a, b) => a.localeCompare(b));

  const files = [];
  const manifest = [];
  const skipped = [];

  for (const assetFile of entries) {
    const ext = path.extname(assetFile).toLowerCase();

    try {
      if (ext === ".zip") {
        const result = await collectZipFile(assetFile, tempRoot, filesDir, tarCommand);
        files.push(...result.files);
        manifest.push(...result.manifest);
      } else if (PDN_LIKE_RE.test(assetFile)) {
        const result = await collectDirectFile(assetFile, filesDir);
        if (result.file) files.push(result.file);
        manifest.push(result.manifest);
      } else if (SKIPPED_ASSET_RE.test(assetFile)) {
        skipped.push({
          ok: false,
          source: assetFile,
          games: 0,
          reason: "unsupported-binary-asset",
        });
      } else {
        skipped.push({
          ok: false,
          source: assetFile,
          games: 0,
          reason: "unsupported-extension",
        });
      }
    } catch (error) {
      manifest.push({
        ok: false,
        source: assetFile,
        games: 0,
        reason: "asset-error",
        error: String(error?.message || error),
      });
    }
  }

  const combinedParts = [];
  for (const file of files.sort((a, b) => a.file.localeCompare(b.file))) {
    const text = await fs.readFile(file.file, "utf8");
    combinedParts.push(`; ===== ${file.source}${file.entry ? ` :: ${file.entry}` : ""} =====\n\n${text.trim()}`);
  }

  const games = files.reduce((sum, file) => sum + file.games, 0);
  const result = {
    assets: entries.length,
    files,
    skipped: [
      ...manifest.filter((entry) => !entry.ok),
      ...skipped,
    ],
    games,
    combinedFile,
    manifestFile,
  };

  await writeTextAtomic(combinedFile, `${combinedParts.join("\n\n")}\n`);
  await writeJsonAtomic(manifestFile, {
    ...result,
    manifest,
    skipped,
  });

  await fs.rm(tempRoot, { recursive: true, force: true });

  return result;
}
