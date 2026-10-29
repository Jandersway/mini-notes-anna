import { spawn } from "node:child_process";
import { nativeBinary } from "./common.mjs";
// A development launcher only. Release archives contain the Go executable itself.
const child = spawn(nativeBinary, [], {
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, NOTES_ALLOW_LEGACY_HARNESS: "1" },
});
child.on("error", (error) => {
  console.error(
    `Build the Executa first: npm run build:tool. ${error.message}`,
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
