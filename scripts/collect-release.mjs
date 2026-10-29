import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
const names = [
  "notes-summary-darwin-arm64.tar.gz",
  "notes-summary-darwin-x86_64.tar.gz",
  "notes-summary-windows-x86_64.zip",
];
assert.deepEqual(
  readdirSync("dist")
    .filter((name) => /\.(zip|tar\.gz)$/.test(name))
    .sort(),
  [...names].sort(),
);
const checksums = names.map((name) => {
  const hash = createHash("sha256")
    .update(readFileSync(`dist/${name}`))
    .digest("hex");
  assert.equal(readFileSync(`dist/${name}.sha256`, "utf8").split(" ")[0], hash);
  return `${hash}  ${name}\n`;
});
writeFileSync("dist/SHA256SUMS.txt", checksums.join(""));
console.log("All three release assets and SHA-256 checksums verified.");
