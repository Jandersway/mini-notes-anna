import type { AnnaRuntime } from "./runtime";
import type { Note } from "../notes/model";
import toolManifest from "../../executas/notes-summary/manifest.json";
export const TOOL_ID = toolManifest.name;

export async function summarizeNotes(
  anna: AnnaRuntime,
  notes: Note[],
): Promise<string> {
  if (notes.length === 0) throw new Error("先添加一条笔记，再生成总结。");
  const result = await anna.tools.invoke(
    { tool_id: TOOL_ID, method: "summarize", args: { notes } },
    { timeoutMs: 65000 },
  );
  // The Host API removes the Executa success/data envelope.
  if (
    !result ||
    typeof result !== "object" ||
    !("summary" in result) ||
    typeof result.summary !== "string" ||
    !result.summary.trim()
  )
    throw new Error("工具没有返回有效总结。");
  return result.summary;
}
