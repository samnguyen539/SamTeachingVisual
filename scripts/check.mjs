import { readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const ignored = new Set([".git", "dist", "node_modules"]);
const files = [];

async function walk(directory) {
  for (const name of await readdir(directory)) {
    if (ignored.has(name)) continue;
    const fullPath = path.join(directory, name);
    const information = await stat(fullPath);
    if (information.isDirectory()) await walk(fullPath);
    else files.push(fullPath);
  }
}

await walk(root);
const scripts = files.filter((file) => /\.(m?js)$/.test(file));
for (const file of scripts) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Syntax error in ${path.relative(root, file)}\n${result.stderr}`);
  }
}

if (files.some((file) => file.includes(`${path.sep}.github${path.sep}workflows${path.sep}`))) {
  throw new Error("GitHub Actions are forbidden for this project");
}

const suspiciousPatterns = [
  /(?:AIza|ya29\.)[A-Za-z0-9._-]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /sk-[A-Za-z0-9_-]{20,}/
];
for (const file of files.filter((item) => /\.(?:m?js|json|html|css|md|txt|yml|yaml)$/.test(item))) {
  const text = await readFile(file, "utf8");
  if (suspiciousPatterns.some((pattern) => pattern.test(text))) {
    throw new Error(`Credential-like value detected in ${path.relative(root, file)}`);
  }
}

const html = await readFile(path.join(root, "index.html"), "utf8");
for (const id of ["drawingCanvas", "recordBtn", "uploadDriveBtn", "markerList", "mediaInput"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing required UI element #${id}`);
}
console.log(`Checked ${scripts.length} scripts and ${files.length} repository files; no workflows or credentials found.`);
