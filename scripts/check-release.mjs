import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { root, toolManifest } from "./common.mjs";
const tag = process.env.RELEASE_TAG;
assert.equal(
  tag,
  `v${toolManifest.version}`,
  "Tag must match the Tool manifest version",
);
assert.equal(
  JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version,
  toolManifest.version,
);
console.log(`Release version ${tag} verified.`);
