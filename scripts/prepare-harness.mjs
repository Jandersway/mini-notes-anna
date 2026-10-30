import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cli, run } from "./common.mjs";

// Warm the exact runtime selected by the installed CLI before its 8s bridge
// handshake starts. Do not modify the CLI or maintain a second runtime pin.
const distribution = dirname(cli);
const versions = new Set();
for (const file of readdirSync(distribution)) {
  if (!/^bridge-.*\.js$/.test(file)) continue;
  const source = readFileSync(resolve(distribution, file), "utf8");
  for (const match of source.matchAll(
    /(?:const|let|var) PINNED_RUNTIME_VERSION\s*=\s*["']([^"']+)["']/g,
  ))
    versions.add(match[1]);
}
if (versions.size !== 1)
  throw new Error(
    "Cannot identify one pinned Anna runtime; inspect the installed CLI before proceeding.",
  );
const [version] = versions;
console.log(
  `Preparing official Anna runtime ${version} (first run may download dependencies)…`,
);
run(
  "uvx",
  [
    "--from",
    `anna-app-runtime-local==${version}`,
    "python",
    "-c",
    "import anna_app_runtime_local; print('Anna runtime ready')",
  ],
  { timeout: 180000 },
);
