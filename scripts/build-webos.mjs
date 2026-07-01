import { cp, mkdir, rm, copyFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, "dist");
const webosDir = join(root, "platforms", "webos");
const appDir = join(webosDir, "app");
const assetsDir = join(webosDir, "assets");

await assertDistExists();
await rm(appDir, { recursive: true, force: true });
await mkdir(appDir, { recursive: true });
await cp(distDir, appDir, { recursive: true });
await copyFile(join(webosDir, "appinfo.json"), join(appDir, "appinfo.json"));
await copyFile(join(assetsDir, "icon.png"), join(appDir, "icon.png"));
await copyFile(join(assetsDir, "largeicon.png"), join(appDir, "largeicon.png"));

console.log(`webOS app prepared at ${relative(appDir)}`);

async function assertDistExists() {
  try {
    await readdir(distDir);
  } catch {
    throw new Error("Missing dist folder. Run npm run build before build:webos.");
  }
}

function relative(path) {
  return path.replace(`${root}\\`, "").replace(`${root}/`, "");
}
