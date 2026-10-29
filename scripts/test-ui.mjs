import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { root, cli } from "./common.mjs";
const url = process.env.HARNESS_URL || "http://127.0.0.1:5189";
let harness,
  browser,
  logs = "";
const records = [],
  pending = [];
const directory = resolve(root, "test-results");
mkdirSync(directory, { recursive: true });
try {
  if (!process.env.HARNESS_URL) {
    harness = spawn(
      process.execPath,
      [cli, "dev", "--no-llm", "--no-watch", "--port", "5189"],
      { cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    harness.on("error", (error) => {
      logs += error.message;
    });
    for (const stream of [harness.stdout, harness.stderr])
      stream.on("data", (chunk) => {
        logs += chunk;
      });
  }
  let started = false;
  for (let i = 0; i < 45; i++) {
    try {
      if ((await fetch(`${url}/api/config`)).ok) {
        started = true;
        break;
      }
    } catch {}
    if (harness?.exitCode != null) throw new Error(`Harness exited: ${logs}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(started, `Harness did not start: ${logs}`);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.on("response", (response) => {
    if (!response.url().endsWith("/api/session/call")) return;
    const body = response.request().postDataJSON();
    if (!["storage", "tools"].includes(body.ns)) return;
    pending.push(
      response
        .json()
        .then((result) =>
          records.push({
            ns: body.ns,
            method: body.method,
            args: body.args,
            result,
          }),
        )
        .catch(() => {}),
    );
  });
  await page.goto(url);
  const app = page.frameLocator("#app");
  await expect(app.getByRole("status")).toContainText("已连接", {
    timeout: 25000,
  });
  const input = app.getByLabel("此刻，想到什么？");
  const save = app.getByRole("button", { name: "＋ 保存笔记" });
  await expect(save).toBeDisabled();
  for (const text of [
    "明天跟客户 follow up",
    "修复登录 bug",
    "Workshop 内容想法",
  ]) {
    await input.fill(text);
    await save.click();
    await expect(input).toHaveValue("");
  }
  await expect(app.getByTestId("note")).toHaveCount(3);
  await app.getByRole("button", { name: "删除笔记 2", exact: true }).click();
  await expect(app.getByTestId("note")).toHaveCount(2);
  await app.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(app.getByTestId("note")).toHaveCount(2);
  // Reload only the iframe: keep the outer harness session/runtime_state alive.
  const frame = await page.locator("#app").elementHandle();
  const content = await frame.contentFrame();
  await content.evaluate(() => location.reload());
  await expect(app.getByRole("status")).toContainText("已连接");
  await expect(app.getByTestId("note")).toHaveCount(2);
  await expect(app.getByTestId("note").nth(0)).toContainText("follow up");
  await expect(app.getByTestId("note").nth(1)).toContainText("Workshop");
  // Capture a clean preview before showing the expected disabled-LLM error.
  const height = await app
    .locator("body")
    .evaluate(() => document.documentElement.scrollHeight);
  await page.locator("#app").evaluate((element, height) => {
    element.style.height = `${height}px`;
    element.style.maxHeight = "none";
  }, height);
  await page
    .locator("#app")
    .screenshot({ path: resolve(directory, "ui-preview.png") });
  await app.getByRole("button", { name: "Summarize · 生成总结" }).click();
  await expect(app.getByRole("alert")).toContainText(
    "harness started with --no-llm",
    { timeout: 15000 },
  );
  await expect(app.getByTestId("summary")).toHaveCount(0);
  await Promise.all(pending);
  const reads = records.filter((r) => r.ns === "storage" && r.method === "get");
  const writes = records.filter(
    (r) => r.ns === "storage" && r.method === "set",
  );
  const invokes = records.filter(
    (r) => r.ns === "tools" && r.method === "invoke",
  );
  assert.ok(reads.length >= 5);
  assert.equal(writes.length, 4);
  assert.equal(invokes.length, 1);
  assert.deepEqual(
    writes.at(-1).args.value.notes.map((note) => note.order),
    [1, 3],
  );
  assert.equal(invokes[0].args.method, "summarize");
  assert.deepEqual(
    invokes[0].args.args.notes.map((note) => note.order),
    [1, 3],
  );
  await page
    .locator("#app")
    .screenshot({ path: resolve(directory, "ui-desktop.png") });
  await page.locator("#app").evaluate((element) => {
    element.style.width = "390px";
    element.style.height = "1600px";
    element.style.maxHeight = "none";
  });
  await app
    .locator("body")
    .evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  assert.ok(
    await app
      .locator("body")
      .evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
  );
  await page
    .locator("#app")
    .screenshot({ path: resolve(directory, "ui-mobile.png") });
  console.log(
    `PASS: actual Anna iframe create/read/delete/reload + tools.invoke expected --no-llm error. ${reads.length} storage.get / ${writes.length} storage.set / ${invokes.length} tools.invoke recorded.`,
  );
} finally {
  writeFileSync(
    resolve(directory, "ui-rpc.jsonl"),
    records.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  writeFileSync(resolve(directory, "ui-harness.log"), logs);
  if (browser) await browser.close();
  if (harness && harness.exitCode === null) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(harness.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else harness.kill("SIGINT");
  }
}
