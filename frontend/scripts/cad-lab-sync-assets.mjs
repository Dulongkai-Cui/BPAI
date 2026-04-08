import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const cadLabAssetsDir = path.join(frontendRoot, "cad-lab", "public", "assets");

const assetCopies = [
  {
    from: path.join(
      frontendRoot,
      "node_modules",
      "@mlightcad",
      "cad-simple-viewer",
      "dist",
      "libredwg-parser-worker.js",
    ),
    to: path.join(cadLabAssetsDir, "libredwg-parser-worker.js"),
  },
  {
    from: path.join(
      frontendRoot,
      "node_modules",
      "@mlightcad",
      "cad-simple-viewer",
      "dist",
      "mtext-renderer-worker.js",
    ),
    to: path.join(cadLabAssetsDir, "mtext-renderer-worker.js"),
  },
  {
    from: path.join(
      frontendRoot,
      "node_modules",
      "@mlightcad",
      "data-model",
      "dist",
      "dxf-parser-worker.js",
    ),
    to: path.join(cadLabAssetsDir, "dxf-parser-worker.js"),
  },
  {
    from: path.join(
      frontendRoot,
      "node_modules",
      "@mlightcad",
      "libredwg-web",
      "wasm",
      "libredwg-web.wasm",
    ),
    to: path.join(cadLabAssetsDir, "libredwg-web.wasm"),
  },
];

await mkdir(cadLabAssetsDir, { recursive: true });

for (const entry of assetCopies) {
  await copyFile(entry.from, entry.to);
  console.log(`[cad-lab] synced ${path.basename(entry.to)}`);
}
