import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { root, cli } from "./common.mjs";
const url = process.env.HARNESS_URL || "http://127.0.0.1:5189";
let harness,
  browser,
  activePage,
  logs = "";
const records = [],
  pending = [],
  forbiddenLlmCalls = [];
const directory = resolve(root, "test-results");
mkdirSync(directory, { recursive: true });
for (const name of ["ui-failure.txt", "ui-failure.png"])
  rmSync(resolve(directory, name), { force: true });
async function openCase(scenario) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  activePage = page;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/api/session/call") return;
    const body = request.postDataJSON();
    if (body?.ns === "llm")
      forbiddenLlmCalls.push({ scenario, method: body.method });
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname !== "/api/session/call") return;
    const body = response.request().postDataJSON();
    if (!["storage", "tools", "llm"].includes(body?.ns)) return;
    pending.push(
      response
        .json()
        .then((result) =>
          records.push({
            scenario,
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
  return {
    page,
    app,
    input: app.getByLabel("写一条笔记"),
    save: app.getByRole("button", { name: "保存笔记", exact: true }),
  };
}
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
  const { page, app, input, save } = await openCase("main");
  await expect(save).toBeDisabled();
  await input.fill("   ");
  await expect(save).toBeDisabled();
  await input.fill("");
  const initialLayout = await app.locator("body").evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    height: document.documentElement.scrollHeight,
    viewportHeight: document.documentElement.clientHeight,
  }));
  assert.ok(initialLayout.width <= initialLayout.viewportWidth);
  assert.ok(
    initialLayout.height <= initialLayout.viewportHeight,
    "Empty desktop must fit the unmodified harness frame",
  );
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
  await expect(app.getByTestId("note")).toHaveCount(3);
  await expect(
    app.getByRole("button", { name: "取消", exact: true }),
  ).toBeFocused();
  await app.getByRole("button", { name: "取消", exact: true }).click();
  await expect(app.getByTestId("note")).toHaveCount(3);
  await app.getByRole("button", { name: "删除笔记 2", exact: true }).click();
  await app.getByRole("button", { name: "确认删除", exact: true }).click();
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
  // Keep the real harness geometry: screenshots must not mask overflow.
  await page
    .locator("#app")
    .screenshot({ path: resolve(directory, "ui-preview.png") });
  await input.fill("未保存的草稿应保留");
  await app.getByRole("button", { name: "生成总结 · Summarize" }).click();
  await expect(app.getByRole("alert")).toContainText(
    "harness started with --no-llm",
    { timeout: 15000 },
  );
  await expect(app.getByTestId("summary")).toHaveCount(0);
  await expect(input).toHaveValue("未保存的草稿应保留");
  await expect(input).toBeEnabled();
  await expect(app.locator(".composer-panel [role=alert]")).toHaveCount(0);
  await expect(app.locator(".summary-output")).toBeHidden();
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
  await page.getByRole("button", { name: "📱 Mobile", exact: true }).click();
  await expect(app.getByTestId("note")).toHaveCount(2);
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
  await page.close();

  // Inject failures only, never a successful storage or summary replacement.
  // Each scenario owns a new harness session; user preview sessions are untouched.
  const failureCase = await openCase("storage-failure");
  await failureCase.input.fill("已保存的笔记应保留");
  await failureCase.save.click();
  await expect(failureCase.app.getByTestId("note")).toHaveCount(1);
  let rejectWrites = true;
  await failureCase.page.route("**/api/session/call", async (route) => {
    const body = route.request().postDataJSON();
    if (rejectWrites && body.ns === "storage" && body.method === "set") {
      await route.fulfill({
        json: {
          ok: false,
          error: {
            code: "storage_unavailable",
            message: "Storage unavailable (test)",
          },
        },
      });
    } else await route.continue();
  });
  await failureCase.input.fill("保存失败也不能丢失的草稿");
  await failureCase.save.click();
  await expect(failureCase.app.getByRole("alert")).toContainText(
    "保存失败，输入内容已保留",
  );
  await expect(failureCase.input).toHaveValue("保存失败也不能丢失的草稿");
  await expect(failureCase.app.getByTestId("note")).toHaveCount(1);
  await failureCase.app
    .getByRole("button", { name: "删除笔记 1", exact: true })
    .click();
  await failureCase.app
    .getByRole("button", { name: "确认删除", exact: true })
    .click();
  await expect(failureCase.app.getByRole("alert")).toContainText(
    "删除失败，笔记仍保留",
  );
  await expect(failureCase.app.getByTestId("note")).toHaveCount(1);
  await failureCase.app
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await failureCase.app
    .getByRole("button", { name: "刷新", exact: true })
    .click();
  await expect(failureCase.app.getByTestId("note")).toContainText(
    "已保存的笔记应保留",
  );
  rejectWrites = false;
  await failureCase.save.click();
  await expect(failureCase.app.getByTestId("note")).toHaveCount(2);
  await expect(failureCase.input).toHaveValue("");
  await expect(failureCase.app.getByRole("alert")).toHaveCount(0);
  await failureCase.page.close();
  console.log(
    "PASS: failed saves preserve drafts; failed deletes preserve stored notes; retry recovers.",
  );

  const textCase = await openCase("safe-text");
  const literal =
    '<img src=x onerror="window.__notesInjection=true"><script>window.__notesInjection=true</script>';
  await textCase.input.fill(literal);
  await textCase.save.click();
  await expect(textCase.app.locator(".note-row p")).toHaveText(literal);
  await expect(
    textCase.app.locator(".note-card img, .note-card script"),
  ).toHaveCount(0);
  assert.equal(
    await textCase.app.locator("body").evaluate(() => window.__notesInjection),
    undefined,
  );
  await textCase.page.route("**/api/session/call", async (route) => {
    const body = route.request().postDataJSON();
    if (body.ns === "storage" && body.method === "set") {
      await route.fulfill({
        json: { ok: false, error: { code: "test_error", message: literal } },
      });
    } else await route.continue();
  });
  await textCase.input.fill("错误详情必须安全渲染");
  await textCase.save.click();
  await expect(textCase.app.getByRole("alert")).toContainText(literal);
  await textCase.app.getByText("查看详情", { exact: true }).click();
  await expect(textCase.app.locator(".notice img, .notice script")).toHaveCount(
    0,
  );
  assert.equal(
    await textCase.app.locator("body").evaluate(() => window.__notesInjection),
    undefined,
  );
  await textCase.page.close();
  console.log(
    "PASS: note and error content render as text, not HTML or script.",
  );

  await Promise.all(pending);
  assert.deepEqual(
    forbiddenLlmCalls,
    [],
    "Frontend must never call the llm namespace",
  );
  console.log("PASS: no direct frontend llm calls in any UI scenario.");
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage
      .locator("#app")
      .screenshot({ path: resolve(directory, "ui-failure.png"), timeout: 5000 })
      .catch(() => {});
  }
  writeFileSync(
    resolve(directory, "ui-failure.txt"),
    String(error.stack || error),
  );
  throw error;
} finally {
  await Promise.all(pending);
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
