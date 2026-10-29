import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { root, toolDir, toolManifest } from "./common.mjs";
const app = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const config = JSON.parse(
  readFileSync(resolve(toolDir, "executa.json"), "utf8"),
);
assert.equal(app.required_executas[0].tool_id, toolManifest.name);
assert.equal(config.tool_id, toolManifest.name);
assert.deepEqual(app.ui.host_api.tools, [toolManifest.name]);
assert.deepEqual(app.ui.host_api.storage, ["get", "set"]);
assert.deepEqual(toolManifest.host_capabilities, ["llm.sample"]);
assert.equal(config.version, toolManifest.version);
assert.equal(toolManifest.tools[0].name, "summarize");
assert.ok(Array.isArray(toolManifest.tools[0].parameters));
assert.ok(!("input_schema" in toolManifest.tools[0]));
assert.ok(
  existsSync(resolve(root, "bundle", app.ui.bundle.entry)),
  "Run npm run build first",
);
const toolsSource = readFileSync(resolve(root, "src/anna/tools.ts"), "utf8");
assert.match(toolsSource, /TOOL_ID = toolManifest.name/);
console.log(
  "App / frontend / Executa identities and bundle entry are consistent.",
);
