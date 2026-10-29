import { test } from "node:test";
import assert from "node:assert/strict";
import type { AnnaRuntime } from "../src/anna/runtime.ts";
import { NotesRepository, STORAGE_KEY } from "../src/anna/storage.ts";
import { summarizeNotes, TOOL_ID } from "../src/anna/tools.ts";
import { emptyState, parseState } from "../src/notes/model.ts";

function memoryHost() {
  let value: unknown = null;
  let fail = false;
  const calls: string[] = [];
  const anna: AnnaRuntime = {
    storage: {
      async get(args) {
        assert.equal(args.key, STORAGE_KEY);
        calls.push("get");
        return { value: structuredClone(value) };
      },
      async set(args) {
        assert.equal(args.key, STORAGE_KEY);
        calls.push("set");
        if (fail) throw new Error("storage failed");
        value = structuredClone(args.value);
      },
    },
    tools: {
      async invoke() {
        throw new Error("unexpected tool invocation");
      },
    },
  };
  let id = 0;
  return {
    anna,
    calls,
    repo: new NotesRepository(anna, () => `note-${++id}`),
    fail: (next: boolean) => {
      fail = next;
    },
  };
}

test("create, load and delete use Host API; deletion never reuses an order", async () => {
  const { repo, calls } = memoryHost();
  assert.deepEqual(await repo.load(), emptyState());
  const first = await repo.add("  客户 follow up  ");
  assert.equal(first.notes[0].content, "客户 follow up");
  await repo.add("修复登录 bug");
  await repo.remove(first.notes[0].id);
  const state = await repo.add("Workshop 想法");
  assert.deepEqual(
    state.notes.map((n) => n.order),
    [2, 3],
  );
  assert.deepEqual(await repo.load(), state);
  assert.deepEqual(calls, [
    "get",
    "get",
    "set",
    "get",
    "set",
    "get",
    "set",
    "get",
    "set",
    "get",
  ]);
});
test("serializes concurrent writes and recovers the queue after a failed save", async () => {
  const host = memoryHost();
  host.fail(true);
  await assert.rejects(host.repo.add("keep this input"), /storage failed/);
  host.fail(false);
  await Promise.all([host.repo.add("first"), host.repo.add("second")]);
  const state = await host.repo.load();
  assert.deepEqual(
    state.notes.map((n) => n.content),
    ["first", "second"],
  );
  assert.deepEqual(
    state.notes.map((n) => n.order),
    [1, 2],
  );
});
test("failed delete leaves persisted state intact; empty save does not touch host", async () => {
  const host = memoryHost();
  await assert.rejects(host.repo.add("  \n "));
  assert.equal(host.calls.length, 0);
  const state = await host.repo.add("keep me");
  host.fail(true);
  await assert.rejects(host.repo.remove(state.notes[0].id));
  assert.deepEqual(await host.repo.load(), state);
});
test("rejects corrupt or unsupported state instead of overwriting it", () => {
  assert.throws(() => parseState({ schemaVersion: 2, notes: [] }));
  assert.throws(() =>
    parseState({
      schemaVersion: 1,
      nextOrder: 1,
      notes: [{ id: "1", order: 2, content: "bad" }],
    }),
  );
  assert.throws(() => parseState(null));
});
test("summary uses the declared tool and returns its result verbatim; errors propagate", async () => {
  const { anna } = memoryHost();
  const notes = [{ id: "1", content: "test", order: 1 }];
  anna.tools.invoke = async (args) => {
    assert.deepEqual(args, {
      tool_id: TOOL_ID,
      method: "summarize",
      args: { notes },
    });
    return { summary: "a host-generated answer" };
  };
  assert.equal(await summarizeNotes(anna, notes), "a host-generated answer");
  anna.tools.invoke = async () => {
    throw new Error("harness started with --no-llm");
  };
  await assert.rejects(summarizeNotes(anna, notes), /--no-llm/);
  await assert.rejects(summarizeNotes(anna, []), /先添加/);
});
