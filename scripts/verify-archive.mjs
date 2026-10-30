import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { root, run, nativePlatform, toolManifest } from "./common.mjs";
import { unpack } from "./archive.mjs";
const flag = process.argv.indexOf("--platform");
const platform = flag >= 0 ? process.argv[flag + 1] : nativePlatform();
assert.ok(
  ["darwin-arm64", "darwin-x86_64", "windows-x86_64"].includes(platform),
);
const native = platform === nativePlatform();
if (process.argv.includes("--require-native"))
  assert.ok(native, `Runner ${nativePlatform()} cannot execute ${platform}`);
const format = platform.startsWith("windows") ? "zip" : "tar.gz";
const name = `notes-summary-${platform}.${format}`;
const bytes = readFileSync(resolve(root, "dist", name));
assert.equal(
  readFileSync(resolve(root, "dist", `${name}.sha256`), "utf8").split(" ")[0],
  createHash("sha256").update(bytes).digest("hex"),
);
const entries = unpack(bytes, format);
const entrypoint = `bin/notes-summary${platform.startsWith("windows") ? ".exe" : ""}`;
assert.deepEqual(
  entries.map((e) => e.name).sort(),
  ["manifest.json", entrypoint].sort(),
);
const manifest = JSON.parse(
  Buffer.from(entries.find((e) => e.name === "manifest.json").bytes).toString(),
);
assert.equal(manifest.name, toolManifest.name);
assert.equal(manifest.version, toolManifest.version);
assert.deepEqual(manifest.tools, toolManifest.tools);
assert.deepEqual(manifest.host_capabilities, ["llm.sample"]);
assert.equal(manifest.runtime.binary.entrypoint, entrypoint);
assert.equal(manifest.runtime.binary.permissions[entrypoint], "0o755");
const executable = entries.find((e) => e.name === entrypoint);
if (format === "tar.gz") assert.equal(executable.mode, 0o755);
// Validate the binary header even when this host cannot execute that platform.
const binary = Buffer.from(executable.bytes);
if (format === "zip") {
  assert.equal(binary.toString("ascii", 0, 2), "MZ");
  const pe = binary.readUInt32LE(0x3c);
  assert.equal(binary.readUInt32LE(pe), 0x4550);
  assert.equal(binary.readUInt16LE(pe + 4), 0x8664);
} else {
  assert.equal(binary.readUInt32LE(0), 0xfeedfacf);
  assert.equal(
    binary.readUInt32LE(4),
    platform === "darwin-arm64" ? 0x100000c : 0x1000007,
  );
}
if (native) {
  const parent = resolve(root, ".cache/unpacked");
  mkdirSync(parent, { recursive: true });
  const target = mkdtempSync(resolve(parent, `${platform}-`));
  for (const entry of entries) {
    const dest = resolve(target, entry.name);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, entry.bytes);
    if (process.platform !== "win32") chmodSync(dest, entry.mode);
  }
  const output = run(resolve(target, entrypoint), [], {
    stdio: "pipe",
    encoding: "utf8",
    input: '{"jsonrpc":"2.0","id":1,"method":"describe"}\n',
    timeout: 10000,
  });
  assert.deepEqual(JSON.parse(output.stdout).result, toolManifest);
  // Run the complete bidirectional protocol suite against the bytes extracted
  // from the shipping archive. Keep this evidence separate from source builds.
  run(
    process.execPath,
    [resolve(root, "scripts/test-protocol.mjs"), resolve(target, entrypoint)],
    {
      env: {
        ...process.env,
        PROTOCOL_EVIDENCE_DIR: `test-results/archive-${platform}`,
      },
      timeout: 30000,
    },
  );
  console.log(
    `PASS: ${platform} archive, manifest, checksum, architecture, extracted binary describe and full protocol suite.`,
  );
} else
  console.log(
    `PASS: ${platform} archive, manifest, checksum, architecture and executable mode. Native execution awaits its CI runner.`,
  );
