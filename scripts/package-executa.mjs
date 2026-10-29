import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  root,
  run,
  toolDir,
  toolManifest,
  goEnv,
  nativePlatform,
} from "./common.mjs";
import { pack } from "./archive.mjs";
const flag = process.argv.indexOf("--platform");
const platform = flag >= 0 ? process.argv[flag + 1] : nativePlatform();
const targets = {
  "darwin-arm64": ["darwin", "arm64"],
  "darwin-x86_64": ["darwin", "amd64"],
  "windows-x86_64": ["windows", "amd64"],
};
if (!targets[platform])
  throw new Error(
    `Unsupported platform ${platform}; choose ${Object.keys(targets).join(", ")}`,
  );
const [GOOS, GOARCH] = targets[platform];
const stageRoot = resolve(root, ".cache/packages");
mkdirSync(stageRoot, { recursive: true });
const stage = mkdtempSync(resolve(stageRoot, `${platform}-`));
const entrypoint = `bin/notes-summary${GOOS === "windows" ? ".exe" : ""}`;
mkdirSync(resolve(stage, "bin"));
run(
  process.env.GO_BINARY || "go",
  [
    "build",
    "-trimpath",
    "-ldflags=-s -w",
    "-o",
    resolve(stage, entrypoint),
    ".",
  ],
  { cwd: toolDir, env: goEnv({ GOOS, GOARCH }) },
);
const manifest = {
  ...toolManifest,
  runtime: {
    type: "binary",
    binary: { entrypoint, permissions: { [entrypoint]: "0o755" } },
  },
};
const format = GOOS === "windows" ? "zip" : "tar.gz";
const name = `notes-summary-${platform}.${format}`;
const data = pack(
  [
    {
      name: "manifest.json",
      bytes: Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
      mode: 0o644,
    },
    {
      name: entrypoint,
      bytes: readFileSync(resolve(stage, entrypoint)),
      mode: 0o755,
    },
  ],
  format,
);
mkdirSync(resolve(root, "dist"), { recursive: true });
writeFileSync(resolve(root, "dist", name), data);
writeFileSync(
  resolve(root, "dist", `${name}.sha256`),
  `${createHash("sha256").update(data).digest("hex")}  ${name}\n`,
);
console.log(`Packaged dist/${name}`);
