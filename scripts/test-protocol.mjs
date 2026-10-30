import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { root, nativeBinary, toolManifest } from "./common.mjs";

const binary = process.argv[2] || nativeBinary;
const child = spawn(binary, [], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, NOTES_SAMPLING_TIMEOUT_MS: "800" },
});
const exited = once(child, "exit");
let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
const frames = [],
  waiting = [],
  transcript = [];
const watchdog = setTimeout(() => child.kill(), 15000);
createInterface({ input: child.stdout }).on("line", (line) => {
  let frame;
  try {
    frame = JSON.parse(line);
    assert.equal(frame.jsonrpc, "2.0");
  } catch (error) {
    frames.push({ invalid: line });
    return;
  }
  transcript.push({ direction: "tool-to-host", frame });
  const index = waiting.findIndex((wait) => wait.predicate(frame));
  if (index >= 0) waiting.splice(index, 1)[0].resolve(frame);
  else frames.push(frame);
});
function next(predicate) {
  const index = frames.findIndex(predicate);
  if (index >= 0) return Promise.resolve(frames.splice(index, 1)[0]);
  return new Promise((resolve, reject) => {
    const waiter = {
      predicate,
      resolve: (frame) => {
        clearTimeout(timer);
        resolve(frame);
      },
    };
    const timer = setTimeout(() => {
      const i = waiting.indexOf(waiter);
      if (i >= 0) waiting.splice(i, 1);
      reject(new Error(`Protocol response timed out. ${stderr}`));
    }, 4000);
    waiting.push(waiter);
  });
}
function send(frame) {
  transcript.push({ direction: "host-to-tool", frame });
  child.stdin.write(`${JSON.stringify(frame)}\n`);
}
const request = (id, method, params = {}) => {
  send({ jsonrpc: "2.0", id, method, params });
  return next((f) => f.id === id);
};
const invoke = (id, content = "follow up") =>
  request(id, "invoke", {
    tool: "summarize",
    arguments: { notes: [{ content, order: 1 }] },
    invoke_id: `invoke-${id}`,
  });
const respond = (rpc, text) =>
  send({
    jsonrpc: "2.0",
    id: rpc.id,
    result: {
      role: "assistant",
      content: { type: "text", text },
      model: "protocol-fixture",
    },
  });
try {
  assert.deepEqual((await request(1, "describe")).result, toolManifest);
  const old = await request(2, "initialize", { protocolVersion: "1.1" });
  assert.deepEqual(old.result.client_capabilities, {});
  assert.equal((await invoke(3)).error.code, -32008);
  const init = await request(4, "initialize", { protocolVersion: "2.0" });
  assert.deepEqual(init.result.client_capabilities.sampling, {});
  const first = invoke(5, "明天跟进客户");
  const reverse = await next((f) => f.method === "sampling/createMessage");
  assert.equal(reverse.params.metadata.executa_invoke_id, "invoke-5");
  assert.match(reverse.params.messages[0].content.text, /明天跟进客户/);
  // A regular request must still be serviced while invoke waits for sampling.
  assert.equal((await request(6, "health")).result.status, "healthy");
  respond(reverse, "host answer, unmodified");
  assert.equal((await first).result.data.summary, "host answer, unmodified");
  const one = invoke(7, "first concurrent"),
    two = invoke(8, "second concurrent");
  const r1 = await next((f) => f.method === "sampling/createMessage");
  const r2 = await next((f) => f.method === "sampling/createMessage");
  respond(r2, r2.params.metadata.executa_invoke_id);
  respond(r1, r1.params.metadata.executa_invoke_id);
  assert.equal((await one).result.data.summary, "invoke-7");
  assert.equal((await two).result.data.summary, "invoke-8");
  const failure = invoke(9);
  const failRpc = await next((f) => f.method === "sampling/createMessage");
  send({
    jsonrpc: "2.0",
    id: failRpc.id,
    error: { code: -32008, message: "host sampling disabled" },
  });
  assert.equal((await failure).error.message, "host sampling disabled");
  const timeout = invoke(10);
  await next((f) => f.method === "sampling/createMessage");
  assert.equal((await timeout).error.code, -32005);
  const malformed = invoke(11);
  const malformedRpc = await next((f) => f.method === "sampling/createMessage");
  send({
    jsonrpc: "2.0",
    id: malformedRpc.id,
    result: { content: { type: "text", text: "" } },
  });
  assert.equal((await malformed).error.code, -32603);
  assert.equal(
    (
      await request(12, "invoke", {
        tool: "summarize",
        arguments: { notes: [] },
      })
    ).error.code,
    -32602,
  );
  assert.equal((await request(13, "does-not-exist")).error.code, -32601);
  child.stdin.write("{not-json}\n");
  assert.equal((await next((f) => f.id === null)).error.code, -32700);
  send({ jsonrpc: "2.0", id: "late:unknown", result: {} });
  assert.equal((await request(14, "health")).result.status, "healthy");
  // EOF must cancel a waiting sampling call and drain its error response.
  const cancelled = invoke(15);
  await next((f) => f.method === "sampling/createMessage");
  child.stdin.end();
  assert.match((await cancelled).error.message, /host closed/);
  assert.equal((await exited)[0], 0);
  assert.equal(
    frames.length,
    0,
    `Unexpected/non-JSON output: ${JSON.stringify(frames)}`,
  );
  assert.match(stderr, /sampling.request/);
  const evidence = resolve(
    root,
    process.env.PROTOCOL_EVIDENCE_DIR || "test-results",
  );
  mkdirSync(evidence, { recursive: true });
  writeFileSync(
    resolve(evidence, "protocol.jsonl"),
    transcript.map((x) => JSON.stringify(x)).join("\n") + "\n",
  );
  writeFileSync(resolve(evidence, "protocol.stderr.log"), stderr);
  console.log(
    "PASS: negotiation, describe, real reverse RPC, concurrent correlation, host errors, timeout, validation, continued reading, EOF and stdout purity.",
  );
} finally {
  clearTimeout(watchdog);
  if (child.exitCode === null) child.kill();
}
