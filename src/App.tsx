import { useEffect, useRef, useState, type FormEvent } from "react";
import { connectAnna, errorMessage, type AnnaRuntime } from "./anna/runtime";
import { NotesRepository } from "./anna/storage";
import { summarizeNotes } from "./anna/tools";
import { emptyState, MAX_CONTENT, type NotesState } from "./notes/model";

export function App() {
  const [state, setState] = useState<NotesState>(emptyState);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("正在连接 Anna…");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const service = useRef<{ anna: AnnaRuntime; notes: NotesRepository } | null>(
    null,
  );
  const locked = useRef(false);

  async function load() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const anna = await connectAnna();
      const notes = new NotesRepository(anna);
      setState(await notes.load());
      service.current = { anna, notes };
      setSummary("");
      setReady(true);
      setStatus("已连接 · 笔记已同步");
    } catch (e) {
      setError(errorMessage(e));
      setReady(false);
      setStatus("连接未完成");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (locked.current || !service.current || !input.trim()) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      setState(await service.current.notes.add(input));
      setInput("");
      setSummary("");
      setStatus("已保存");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (locked.current || !service.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      setState(await service.current.notes.remove(id));
      setSummary("");
      setStatus("已删除");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function summarize() {
    if (locked.current || !service.current) return;
    locked.current = true;
    setBusy(true);
    setSummarizing(true);
    setError("");
    setSummary("");
    try {
      const snapshot = await service.current.notes.load();
      setState(snapshot);
      setSummary(await summarizeNotes(service.current.anna, snapshot.notes));
      setStatus("总结已更新");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      locked.current = false;
      setBusy(false);
      setSummarizing(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            m.
          </span>
          <span>MINI NOTES</span>
        </div>
        <span className="connection" role="status">
          <i className={ready ? "online" : ""} />
          {status}
        </span>
      </header>
      <section className="intro">
        <p className="eyebrow">A LITTLE SPACE FOR YOUR THOUGHTS</p>
        <h1>
          记下来，<span>理清思绪。</span>
        </h1>
        <p>随手记录灵感、待办与日常，让重要的事留在眼前。</p>
      </section>
      {error && (
        <div className="error" role="alert">
          <strong>暂时未能完成</strong>
          <p>{error}</p>
          {error.includes("--no-llm") && (
            <p>
              当前调试模式关闭了 LLM，这是预期结果。后端总结可通过 mock sampling
              单独验证。
            </p>
          )}
        </div>
      )}
      {!ready && !busy && (
        <button className="secondary" onClick={() => void load()}>
          重新连接
        </button>
      )}
      <div className="workspace">
        <section className="notes-panel" aria-label="笔记">
          <form onSubmit={save} className="composer">
            <label htmlFor="note-content">此刻，想到什么？</label>
            <textarea
              id="note-content"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={MAX_CONTENT}
              disabled={!ready || busy}
              placeholder="一个灵感、一件待办，或想留住的一句话…"
              rows={4}
            />
            <div className="composer-footer">
              <span>
                {input.length} / {MAX_CONTENT}
              </span>
              <button type="submit" disabled={!ready || busy || !input.trim()}>
                ＋ 保存笔记
              </button>
            </div>
          </form>
          <div className="section-heading">
            <h2>
              我的笔记{" "}
              <span>{state.notes.length.toString().padStart(2, "0")}</span>
            </h2>
            <button
              className="text-button"
              disabled={!ready || busy}
              onClick={() => void load()}
            >
              刷新
            </button>
          </div>
          {state.notes.length === 0 ? (
            <div className="empty-state">
              <span aria-hidden="true">≡</span>
              <h3>给第一个想法留个位置</h3>
              <p>在上方写下内容，保存后就会出现在这里。</p>
            </div>
          ) : (
            <ol className="note-list">
              {state.notes.map((note) => (
                <li key={note.id} className="note-card" data-testid="note">
                  <span className="note-order">
                    {note.order.toString().padStart(2, "0")}
                  </span>
                  <p>{note.content}</p>
                  <button
                    className="delete-button"
                    disabled={busy}
                    aria-label={`删除笔记 ${note.order}`}
                    onClick={() => void remove(note.id)}
                  >
                    删除
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
        <aside className="summary-panel">
          <div className="summary-icon" aria-hidden="true">
            ✳
          </div>
          <p className="eyebrow">A MOMENT OF CLARITY</p>
          <h2>从记录，到重点。</h2>
          <p className="summary-description">
            把零散想法整理成简短总结，看看接下来值得关注什么。
          </p>
          <button
            className="summary-button"
            disabled={!ready || busy || state.notes.length === 0}
            onClick={() => void summarize()}
          >
            {summarizing ? "正在整理…" : "Summarize · 生成总结"}
          </button>
          <div className="summary-output" aria-live="polite">
            {summary ? (
              <p data-testid="summary">{summary}</p>
            ) : (
              <p className="summary-placeholder">
                {summarizing ? "正在等待总结结果…" : "你的重点，会出现在这里。"}
              </p>
            )}
          </div>
          <span className="summary-footnote">每次总结以当前笔记为准</span>
        </aside>
      </div>
      <footer className="footer">
        <span>小小记录，慢慢清晰。</span>
        <span>MINI NOTES / ANNA APP</span>
      </footer>
    </main>
  );
}
