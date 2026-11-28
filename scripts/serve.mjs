import { createServer } from "node:http";
import { createReadStream, realpathSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { contentTypes, isSiteFile } from "./site-files.mjs";

const args = process.argv.slice(2);
const source = args.includes("--source");
const port = Number(args.find((value) => !value.startsWith("--")) ?? 4173);
const host = "127.0.0.1";
const directory = fileURLToPath(new URL(source ? "../" : "../dist/", import.meta.url));

function responseError(res, status) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" }).end(String(status));
}

function readRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end
    ? { start, end }
    : null;
}

if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error("预览端口应为 1–65535 的整数");
}

let root;
try {
  root = realpathSync(directory);
} catch {
  throw new Error("发布目录缺失，请先运行 npm run build，或用 npm run dev 预览源文件");
}

createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return responseError(res, 405);
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, `http://${host}`).pathname).slice(1);
  } catch {
    return responseError(res, 400);
  }
  if (!path || path.endsWith("/")) path += "index.html";
  if (!isSiteFile(path)) return responseError(res, 404);

  let file;
  let size;
  try {
    file = realpathSync(join(root, path));
    const stats = statSync(file);
    if (!stats.isFile() || !isSiteFile(relative(root, file))) return responseError(res, 404);
    size = stats.size;
  } catch {
    return responseError(res, 404);
  }
  const headers = {
    "content-type": contentTypes.get(extname(file).toLowerCase()),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes"
  };
  const range = req.headers.range ? readRange(req.headers.range, size) : undefined;
  if (range === null) {
    res.writeHead(416, { ...headers, "content-range": `bytes */${size}` }).end();
    return;
  }
  if (range) {
    headers["content-length"] = range.end - range.start + 1;
    headers["content-range"] = `bytes ${range.start}-${range.end}/${size}`;
  } else {
    headers["content-length"] = size;
  }
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === "HEAD") return res.end();
  const stream = createReadStream(file, range);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}).listen(port, host, () => {
  console.log(`归塑 ReForm · http://${host}:${port}/`);
}).on("error", (error) => {
  console.error(`预览服务器启动失败 ${error.message}`);
  process.exitCode = 1;
});
