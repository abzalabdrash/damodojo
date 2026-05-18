import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const modulePath = "../../../lib/data/idf64-extract.mjs";

describe("IDF64 PDN extractor helpers", () => {
  it("filters ZIP entries to PDN-like text files and ignores tables/PDFs", async () => {
    const { filterPdnLikeEntries } = await import(modulePath);

    expect(
      filterPdnLikeEntries([
        "event/Men1-9.pdn",
        "event/Round_6.txt",
        "event/final.pdf",
        "event/rating.xls",
        "event/image.jpg",
      ])
    ).toEqual(["event/Men1-9.pdn", "event/Round_6.txt"]);
  });

  it("extracts PDN-like files from a zip and combines only files containing games", async () => {
    const { collectIdf64Pdn } = await import(modulePath);
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "idf64-extract-"));
    const source = path.join(temp, "source");
    const out = path.join(temp, "out");
    const zip = path.join(temp, "sample.zip");

    await fs.mkdir(path.join(source, "pdn"), { recursive: true });
    await fs.writeFile(
      path.join(source, "pdn", "round1.pdn"),
      '[Event "Sample"]\n[GameType "20"]\n\n1. cd4 fg5 2. gf4\n',
      "utf8"
    );
    await fs.writeFile(path.join(source, "pdn", "notes.txt"), "not a game", "utf8");
    await fs.writeFile(path.join(source, "table.pdf"), "fake", "utf8");

    await execFileAsync("tar", ["-a", "-cf", zip, "-C", source, "."]);

    const result = await collectIdf64Pdn({
      assetsDir: temp,
      outputDir: out,
      combinedFile: path.join(out, "combined.pdn"),
      manifestFile: path.join(out, "manifest.json"),
    });

    expect(result.games).toBe(1);
    expect(result.files).toHaveLength(1);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "no-games", entry: expect.stringContaining("notes.txt") }),
      ])
    );

    const combined = await fs.readFile(path.join(out, "combined.pdn"), "utf8");
    expect(combined).toContain('[Event "Sample"]');
    expect(combined).not.toContain("not a game");
  });
});
