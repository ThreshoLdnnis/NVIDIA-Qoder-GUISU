import { extname } from "node:path";

export const sections = ["assets", "docs", "workbench"];

export const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".vtt", "text/vtt; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".glb", "model/gltf-binary"],
  [".gltf", "model/gltf+json"]
]);

export function isSiteFile(path) {
  const segments = path.replaceAll("\\", "/").split("/");
  const type = extname(path).toLowerCase();
  if (segments.some((segment) => !segment || segment.startsWith("."))) return false;
  if (!contentTypes.has(type)) return false;
  return segments.length > 1
    ? sections.includes(segments[0])
    : [".html", ".css", ".js", ".mjs", ".ico"].includes(type);
}
