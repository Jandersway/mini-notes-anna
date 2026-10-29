import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { run, toolDir, nativeBinary, goEnv } from "./common.mjs";
mkdirSync(dirname(nativeBinary), { recursive: true });
run(
  process.env.GO_BINARY || "go",
  ["build", "-trimpath", "-ldflags=-s -w", "-o", nativeBinary, "."],
  { cwd: toolDir, env: goEnv() },
);
console.log(`Built ${nativeBinary}`);
