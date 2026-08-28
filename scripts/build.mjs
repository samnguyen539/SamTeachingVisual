import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const dist = path.join(root, "dist");
const entries = ["index.html", "styles.css", "config.js", "core.mjs", "app.mjs", "src", "sw.js", "manifest.webmanifest", "icons"];
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const entry of entries) {
  const source = path.join(root, entry);
  await stat(source);
  await cp(source, path.join(dist, entry), { recursive: true });
}
console.log(`Built static app into ${dist}`);
