import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const target = process.argv[2] || "chrome";
const supportedTargets = new Set(["chrome", "edge", "firefox"]);

if (!supportedTargets.has(target)) {
  console.error(`Unsupported target: ${target}`);
  console.error(`Expected one of: ${Array.from(supportedTargets).join(", ")}`);
  process.exit(1);
}

const extensionEntries = [
  "_locales",
  "channels",
  "icons",
  "platform",
  "vendor",
  "agent.js",
  "background.js",
  "background-loader.js",
  "browser.js",
  "config.js",
  "content.js",
  "i18n.js",
  "llm.js",
  "pet.js",
  "tools.js",
  "ui.js",
  "LICENSE"
];

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeManifest(base, override) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      merged[key] = mergeManifest(base[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function copyEntry(entry, outDir) {
  const source = path.join(rootDir, entry);
  const destination = path.join(outDir, entry);
  await cp(source, destination, {
    recursive: true,
    force: true,
    errorOnExist: false
  });
}

const outDir = path.join(rootDir, "dist", target);
const baseManifest = await readJson(path.join(rootDir, "manifest", "manifest.base.json"));
const targetManifest = await readJson(path.join(rootDir, "manifest", `manifest.${target}.json`));
const manifest = mergeManifest(baseManifest, targetManifest);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entry of extensionEntries) {
  await copyEntry(entry, outDir);
}

await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built dogeclaw ${target} extension at ${path.relative(rootDir, outDir)}`);
