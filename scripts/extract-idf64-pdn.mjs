import { collectIdf64Pdn } from "../src/lib/data/idf64-extract.mjs";

const result = await collectIdf64Pdn({
  assetsDir: process.env.IDF64_ASSETS_DIR || "data/pdn/idf64/assets",
  outputDir: process.env.IDF64_OUTPUT_DIR || "data/pdn/idf64/extracted-pdn",
});

console.log("DONE IDF64 PDN EXTRACTION");
console.log(`Assets scanned: ${result.assets}`);
console.log(`PDN files extracted: ${result.files.length}`);
console.log(`Games extracted: ${result.games}`);
console.log(`Skipped/failed entries: ${result.skipped.length}`);
console.log(`Combined: ${result.combinedFile}`);
console.log(`Manifest: ${result.manifestFile}`);
