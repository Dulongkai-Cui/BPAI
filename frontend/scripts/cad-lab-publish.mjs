import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const distDir = path.join(frontendRoot, "cad-lab", "dist");
const publicCadLabDir = path.join(frontendRoot, "public", "cad-lab");

await rm(publicCadLabDir, { recursive: true, force: true });
await mkdir(publicCadLabDir, { recursive: true });
await cp(distDir, publicCadLabDir, { recursive: true, force: true });

console.log("[cad-lab] published dist to public/cad-lab");
