import type { AnnaRuntime } from "./runtime";
import {
  addNote,
  emptyState,
  parseState,
  removeNote,
  type NotesState,
} from "../notes/model";
export const STORAGE_KEY = "mini-notes:v1";

export class NotesRepository {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly anna: AnnaRuntime,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}
  async load(): Promise<NotesState> {
    const result = await this.anna.storage.get({ key: STORAGE_KEY });
    // APS has `exists`; legacy runtime_state may only return a null value.
    if (
      result.exists === false ||
      (result.exists === undefined && result.value == null)
    )
      return emptyState();
    return parseState(result.value);
  }
  private mutate(
    change: (state: NotesState) => NotesState,
  ): Promise<NotesState> {
    const operation = this.queue.then(async () => {
      const state = change(await this.load());
      await this.anna.storage.set({ key: STORAGE_KEY, value: state });
      return state;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  add(content: string) {
    if (!content.trim()) return Promise.reject(new Error("先写下一点内容。"));
    return this.mutate((state) => addNote(state, content, this.newId()));
  }
  remove(id: string) {
    return this.mutate((state) => removeNote(state, id));
  }
}
