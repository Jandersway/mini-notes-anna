export interface AnnaRuntime {
  storage: {
    get(args: { key: string }): Promise<{ value: unknown; exists?: boolean }>;
    set(args: { key: string; value: unknown }): Promise<unknown>;
  };
  tools: {
    invoke(
      args: { tool_id: string; method: string; args: unknown },
      opts?: { timeoutMs: number },
    ): Promise<unknown>;
  };
}

let connection: Promise<AnnaRuntime> | undefined;
export function connectAnna(): Promise<AnnaRuntime> {
  if (!connection) {
    connection = (async () => {
      const sdkUrl = "/static/anna-apps/_sdk/latest/index.js";
      const { AnnaAppRuntime } = await import(/* @vite-ignore */ sdkUrl);
      const anna = await AnnaAppRuntime.connect();
      // The shared connection owns this subscription for the iframe lifetime.
      // The SDK immediately replays the host theme, including system mode.
      anna.onThemeChange(({ theme }: { theme: "light" | "dark" }) => {
        document.documentElement.dataset.theme =
          theme === "dark" ? "dark" : "light";
      });
      return anna as AnnaRuntime;
    })().catch((error) => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error)
    return String(error.message);
  return String(error);
}
