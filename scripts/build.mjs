import { deepStrictEqual } from "node:assert";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isSiteFile, sections } from "./site-files.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
const entryPoints = ["index.html", "materials.html", "design.html", "manufacture.html", "cases.html", "workbench/index.html", "docs/project-plan.html"];

function filesIn(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory() && (directory !== root || sections.includes(entry.name))) {
      files.push(...filesIn(path));
    } else if (entry.isFile() && isSiteFile(relative(root, path))) {
      files.push(path);
    }
  }
  return files;
}

function localReferences(source, extension) {
  const pattern = extension === ".html"
    ? /\s(?:src|href|poster|data-photo|data-motion-src)\s*=\s*["']([^"']+)["']/gi
    : /url\(\s*["']?([^\s"')]+)["']?\s*\)/gi;
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function verifyReferences(files) {
  const available = new Set(files.map((file) => resolve(file)));
  const missing = [];
  let checked = 0;
  for (const file of files) {
    const extension = extname(file).toLowerCase();
    if (extension !== ".html" && extension !== ".css") continue;
    const source = readFileSync(file, "utf8");
    for (const ref of new Set(localReferences(source, extension))) {
      const path = ref.split(/[?#]/, 1)[0];
      if (!path || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(path)) continue;
      const decoded = decodeURIComponent(path);
      const target = decoded.startsWith("/")
        ? resolve(root, `.${decoded}`)
        : resolve(dirname(file), decoded);
      checked += 1;
      if (!available.has(target) && !available.has(join(target, "index.html"))) {
        missing.push(`${relative(root, file)} → ${ref}`);
      }
    }
  }
  for (const path of entryPoints) {
    if (!available.has(join(root, path))) missing.push(`页面入口 → ${path}`);
  }
  if (missing.length) throw new Error(`缺少本地文件\n${missing.join("\n")}`);
  return checked;
}

function verifyCaseData() {
  const dataDir = join(root, "workbench", "data");
  const primary = JSON.parse(readFileSync(join(dataDir, "sample-case.json"), "utf8"));
  const fallback = readFileSync(join(dataDir, "sample-case.js"), "utf8");
  const encoded = fallback.match(/window\.REFORM_CASE_FALLBACK\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!encoded) throw new Error("未找到工作台的本地数据回退值");
  deepStrictEqual(JSON.parse(encoded[1]), primary, "工作台 JSON 和本地回退数据应一致");
}

try {
  const files = filesIn(root);
  const checked = verifyReferences(files);
  verifyCaseData();
  if (relative(root, resolve(dist)) !== "dist") throw new Error("构建目录必须位于项目根目录下");
  if (existsSync(dist) && (lstatSync(dist).isSymbolicLink() || !lstatSync(dist).isDirectory())) {
    throw new Error("dist 必须是普通目录");
  }
  const staging = mkdtempSync(join(root, ".reform-dist-"));
  try {
    for (const file of files) {
      const output = join(staging, relative(root, file));
      mkdirSync(dirname(output), { recursive: true });
      copyFileSync(file, output);
    }
    rmSync(dist, { recursive: true, force: true });
    renameSync(staging, dist);
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  }
  console.log(`构建完成 dist/，共 ${files.length} 个文件，校验 ${checked} 个页面内本地引用。`);
} catch (error) {
  console.error(`构建失败 ${error.message}`);
  process.exitCode = 1;
}
