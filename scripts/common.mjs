import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const toolDir = resolve(root, "executas/notes-summary");
export const toolManifest = JSON.parse(
  readFileSync(resolve(toolDir, "manifest.json"), "utf8"),
);
export const cli = resolve(root, "node_modules/@anna-ai/cli/dist/cli.js");
export const nativeBinary = resolve(
  toolDir,
  "bin",
  process.platform === "win32" ? "notes-summary.exe" : "notes-summary",
);
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited ${result.status ?? result.signal}`);
  return result;
}
export function goEnv(extra = {}) {
  const cache = resolve(root, ".cache/go-build");
  mkdirSync(cache, { recursive: true });
  return {
    ...process.env,
    GOCACHE: cache,
    GOTOOLCHAIN: "local",
    CGO_ENABLED: "0",
    ...extra,
  };
}
export function nativePlatform() {
  const os = process.platform === "win32" ? "windows" : process.platform;
  const arch = process.arch === "x64" ? "x86_64" : process.arch;
  return `${os}-${arch}`;
}
