import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { root, cli, run } from "./common.mjs";
const fixture = resolve(root, "fixtures/sampling-success.jsonl");
const expected = JSON.parse(readFileSync(fixture, "utf8").trim()).result.content
  .text;
const args = {
  notes: [
    { order: 1, content: "明天跟客户 follow up" },
    { order: 2, content: "修复登录 bug" },
    { order: 3, content: "Workshop 内容想法" },
  ],
};
const result = run(
  process.execPath,
  [
    cli,
    "executa",
    "dev",
    "--dir",
    "executas/notes-summary",
    "--mock-sampling",
    fixture,
    "--no-agent",
    "--no-image",
    "--no-upload",
    "--invoke",
    "summarize",
    "--args",
    JSON.stringify(args),
    "--json",
  ],
  { encoding: "utf8", stdio: "pipe", timeout: 20000 },
);
assert.equal(JSON.parse(result.stdout).data.summary, expected);
assert.match(result.stderr, /sampling.request/);
assert.match(result.stderr, /sampling.response/);
mkdirSync(resolve(root, "test-results"), { recursive: true });
writeFileSync(resolve(root, "test-results/sampling-cli.json"), result.stdout);
writeFileSync(
  resolve(root, "test-results/sampling-cli.stderr.log"),
  result.stderr,
);
console.log(
  "PASS: anna-app executa dev --mock-sampling returned the fixture through actual Tool reverse RPC.",
);
process.stdout.write(result.stderr);
