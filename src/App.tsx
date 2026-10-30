import { useEffect, useRef, useState } from "react";
import { connectAnna, errorMessage, type AnnaRuntime } from "./anna/runtime";
import { NotesRepository } from "./anna/storage";
import { summarizeNotes } from "./anna/tools";
import { emptyState, MAX_CONTENT, type NotesState } from "./notes/model";

type Operation = "load" | "save" | "delete" | "summary" | null;
type Notice = { title: string; detail: string } | null;
export function App() {
  const [state, setState] = useState<NotesState>(emptyState);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [operation, setOperation] = useState<Operation>("load");
  const [noteError, setNoteError] = useState<Notice>(null);
  const [feedback, setFeedback] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [summaryHint, setSummaryHint] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const service = useRef<{ anna: AnnaRuntime; notes: NotesRepository } | null>(
    null,
  );
  const locked = useRef(false);
  const summarySnapshot = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const busy = operation !== null;
  const localSession =
    ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) &&
    location.pathname.includes("/dev/");
  function updateNotes(next: NotesState) {
    if (
      summarySnapshot.current &&
      summarySnapshot.current !== JSON.stringify(next.notes)
    ) {
      setSummary("");
      setSummaryHint("笔记已更新，请重新生成总结。");
      summarySnapshot.current = "";
    }
    setState(next);
  }
  async function load() {
    if (locked.current) return;
    locked.current = true;
    setOperation("load");
    setNoteError(null);
    try {
      const anna = await connectAnna();
      const notes = service.current?.notes ?? new NotesRepository(anna);
      updateNotes(await notes.load());
      service.current = { anna, notes };
      setReady(true);
      setFeedback("笔记已读取。");
    } catch (e) {
      setNoteError({
        title: ready
          ? "刷新失败，已显示的笔记仍保留"
          : "尚未读取笔记，请重试连接",
        detail: errorMessage(e),
      });
    } finally {
      locked.current = false;
      setOperation(null);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (pendingDelete) cancelButton.current?.focus();
  }, [pendingDelete]);
  async function save() {
    if (locked.current || !ready || !service.current || !input.trim()) return;
    locked.current = true;
    setOperation("save");
    setNoteError(null);
    setFeedback("");
    try {
      const next = await service.current.notes.add(input);
      updateNotes(next);
      setInput("");
      setPendingDelete(null);
      setFeedback(`第 ${next.notes.at(-1)?.order} 条笔记已保存。`);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (e) {
      setNoteError({
        title: "保存失败，输入内容已保留",
        detail: errorMessage(e),
      });
    } finally {
      locked.current = false;
      setOperation(null);
    }
  }
  function cancelDelete() {
    setPendingDelete(null);
    requestAnimationFrame(() => deleteTrigger.current?.focus());
  }
  async function remove(id: string) {
    if (locked.current || !service.current) return;
    locked.current = true;
    setOperation("delete");
    setNoteError(null);
    setFeedback("");
    try {
      updateNotes(await service.current.notes.remove(id));
      setPendingDelete(null);
      setFeedback("笔记已删除。");
      requestAnimationFrame(() => listHeading.current?.focus());
    } catch (e) {
      setNoteError({ title: "删除失败，笔记仍保留", detail: errorMessage(e) });
    } finally {
      locked.current = false;
      setOperation(null);
    }
  }
  async function summarize() {
    if (locked.current || !service.current) return;
    locked.current = true;
    setOperation("summary");
    setSummaryError("");
    setSummaryHint("");
    setPendingDelete(null);
    try {
      const snapshot = await service.current.notes.load();
      updateNotes(snapshot);
      if (!snapshot.notes.length) {
        setSummaryHint("先保存一条笔记，再生成总结。");
        return;
      }
      setSummary(await summarizeNotes(service.current.anna, snapshot.notes));
      summarySnapshot.current = JSON.stringify(snapshot.notes);
      setSummaryHint("");
    } catch (e) {
      setSummaryError(errorMessage(e));
    } finally {
      locked.current = false;
      setOperation(null);
    }
  }
  return (
    <main className="app-shell">
      <header className="header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            m.
          </span>
          <div>
            <h1>Mini Notes</h1>
            <p>随手记录，按需总结。</p>
          </div>
        </div>
        <span className="connection" role="status">
          <i className={ready ? "online" : ""} />
          {ready
            ? "Anna 已连接"
            : operation === "load"
              ? "正在连接…"
              : "尚未连接"}
        </span>
      </header>
      <div className="workspace">
        <section className="composer-panel" aria-label="记录笔记">
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label htmlFor="note-content">写一条笔记</label>
            <textarea
              id="note-content"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={MAX_CONTENT}
              disabled={!ready || operation === "save"}
              placeholder="例如：明天跟进客户反馈，整理会议重点…"
              rows={4}
              aria-describedby="input-help"
              onKeyDown={(event) => {
                if (
                  (event.ctrlKey || event.metaKey) &&
                  event.key === "Enter" &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void save();
                }
              }}
            />
            <div className="composer-footer">
              <span id="input-help">
                Ctrl / ⌘ + Enter 保存
                <br />
                {input.length} / {MAX_CONTENT} 字符
              </span>
              <button type="submit" disabled={!ready || busy || !input.trim()}>
                {operation === "save" ? "正在保存…" : "保存笔记"}
              </button>
            </div>
          </form>
          <p className="save-feedback" aria-live="polite">
            {feedback}
          </p>
          {noteError && (
            <div className="notice error" role="alert">
              <strong>{noteError.title}</strong>
              <details>
                <summary>查看详情</summary>
                <p>{noteError.detail}</p>
              </details>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void load()}
              >
                {ready ? "重新读取笔记" : "重新连接"}
              </button>
            </div>
          )}
        </section>
        <aside className="summary-panel" aria-labelledby="summary-heading">
          <h2 id="summary-heading">
            笔记总结 <span className="count">{state.notes.length} 条笔记</span>
          </h2>
          <p className="summary-description">
            整理已保存笔记的重点。输入框中尚未保存的内容不会参与总结。
          </p>
          <button
            className="summary-button"
            disabled={!ready || busy || state.notes.length === 0}
            onClick={() => void summarize()}
          >
            {operation === "summary" ? "正在生成总结…" : "生成总结 · Summarize"}
          </button>
          {summaryError && (
            <div
              className={`notice ${summaryError.includes("--no-llm") ? "info" : "error"}`}
              role="alert"
            >
              <strong>
                {summaryError.includes("--no-llm")
                  ? "当前环境未启用模型"
                  : "总结生成失败"}
              </strong>
              <p>
                {summaryError.includes("--no-llm")
                  ? "暂时无法生成总结，笔记仍可正常保存和删除。"
                  : "请稍后重试，你的笔记仍保留。"}
              </p>
              <details>
                <summary>查看详情</summary>
                <p>{summaryError}</p>
              </details>
            </div>
          )}
          <div
            className="summary-output"
            hidden={Boolean(summaryError) && !summary}
            aria-live="polite"
            aria-busy={operation === "summary"}
          >
            {summary ? (
              <>
                {summaryError && (
                  <p className="summary-placeholder">上一次生成的总结</p>
                )}
                <p data-testid="summary">{summary}</p>
              </>
            ) : (
              <p className="summary-placeholder">
                {operation === "summary"
                  ? "正在整理已保存的笔记，你可以继续在输入框中记录想法。"
                  : summaryHint ||
                    (state.notes.length
                      ? "点击上方按钮，查看笔记重点。"
                      : "保存第一条笔记后，就可以生成总结。")}
              </p>
            )}
          </div>
        </aside>
        <section className="notes-panel" aria-labelledby="notes-heading">
          <div className="section-heading">
            <div>
              <h2 id="notes-heading" ref={listHeading} tabIndex={-1}>
                我的笔记 <span className="count">{state.notes.length}</span>
              </h2>
              <p>按添加顺序排列</p>
            </div>
            <button
              className="text-button"
              disabled={!ready || busy}
              onClick={() => void load()}
            >
              {operation === "load" && ready ? "读取中…" : "刷新"}
            </button>
          </div>
          {!ready ? (
            <div className="empty-state">
              <p>
                {operation === "load"
                  ? "正在读取笔记…"
                  : "连接成功后，在这里查看已保存的笔记。"}
              </p>
            </div>
          ) : state.notes.length === 0 ? (
            <div className="empty-state">
              <h3>还没有笔记</h3>
              <p>在上方写下内容，点击“保存笔记”即可。</p>
            </div>
          ) : (
            <ol className="note-list">
              {state.notes.map((note) => (
                <li key={note.id} className="note-card" data-testid="note">
                  <div className="note-row">
                    <span className="note-order">
                      {note.order.toString().padStart(2, "0")}
                    </span>
                    <p>{note.content}</p>
                    <button
                      className="delete-button"
                      disabled={busy}
                      aria-label={`删除笔记 ${note.order}`}
                      aria-expanded={pendingDelete === note.id}
                      onClick={(event) => {
                        deleteTrigger.current = event.currentTarget;
                        setPendingDelete(note.id);
                      }}
                    >
                      删除
                    </button>
                  </div>
                  {pendingDelete === note.id && (
                    <div
                      className="delete-confirm"
                      role="group"
                      aria-label={`确认删除笔记 ${note.order}`}
                      onKeyDown={(event) => {
                        if (event.key === "Escape" && !busy) cancelDelete();
                      }}
                    >
                      <p>删除这条笔记？删除后无法恢复。</p>
                      <div>
                        <button
                          className="secondary"
                          ref={cancelButton}
                          disabled={busy}
                          onClick={cancelDelete}
                        >
                          取消
                        </button>
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() => void remove(note.id)}
                        >
                          {operation === "delete" ? "正在删除…" : "确认删除"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      {localSession && (
        <details className="session-note">
          <summary>关于本地会话</summary>
          <p>
            当前本地预览的笔记保存在调试会话中。刷新整个调试页面或重启服务会开启新会话；应用内“刷新”用于重新读取当前会话的笔记。
          </p>
        </details>
      )}
    </main>
  );
}
