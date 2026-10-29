export interface Note {
  id: string;
  content: string;
  order: number;
}
export interface NotesState {
  schemaVersion: 1;
  nextOrder: number;
  notes: Note[];
}
export const MAX_CONTENT = 2000;
export const MAX_NOTES = 100;
export const MAX_TOTAL_BYTES = 48000;
export const emptyState = (): NotesState => ({
  schemaVersion: 1,
  nextOrder: 1,
  notes: [],
});

export function parseState(value: unknown): NotesState {
  if (!value || typeof value !== "object")
    throw new Error("笔记数据格式不正确，未覆盖现有数据。");
  const state = value as NotesState;
  if (
    state.schemaVersion !== 1 ||
    !Array.isArray(state.notes) ||
    !Number.isSafeInteger(state.nextOrder) ||
    state.nextOrder < 1 ||
    state.notes.length > MAX_NOTES
  )
    throw new Error("笔记数据版本或格式不受支持。");
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const note of state.notes) {
    if (
      !note ||
      typeof note.id !== "string" ||
      !note.id ||
      ids.has(note.id) ||
      typeof note.content !== "string" ||
      !note.content.trim() ||
      note.content.length > MAX_CONTENT ||
      !Number.isSafeInteger(note.order) ||
      note.order < 1 ||
      orders.has(note.order) ||
      note.order >= state.nextOrder
    )
      throw new Error("笔记数据校验失败，未覆盖现有数据。");
    ids.add(note.id);
    orders.add(note.order);
  }
  if (
    new TextEncoder().encode(JSON.stringify(state.notes)).length >
    MAX_TOTAL_BYTES
  )
    throw new Error("笔记总量超出本应用支持的范围。");
  return {
    ...state,
    notes: [...state.notes].sort((a, b) => a.order - b.order),
  };
}

export function addNote(
  state: NotesState,
  input: string,
  id: string,
): NotesState {
  const content = input.trim();
  if (!content) throw new Error("先写下一点内容。");
  if (content.length > MAX_CONTENT)
    throw new Error(`每条笔记最多 ${MAX_CONTENT} 个字符。`);
  if (state.notes.length >= MAX_NOTES)
    throw new Error(`最多保存 ${MAX_NOTES} 条笔记。`);
  return parseState({
    ...state,
    nextOrder: state.nextOrder + 1,
    notes: [...state.notes, { id, content, order: state.nextOrder }],
  });
}

export function removeNote(state: NotesState, id: string): NotesState {
  return { ...state, notes: state.notes.filter((note) => note.id !== id) };
}
