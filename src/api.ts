import { invoke, isTauri } from "@tauri-apps/api/core";
export async function request<T>(
  action: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (isTauri()) return invoke<T>("request", { action, args });
  // Explicit development-only integration harness; compiled out of production.
  if (import.meta.env.DEV && import.meta.env.VITE_NOEMA_TEST_BRIDGE === "1") {
    const r = await fetch("http://127.0.0.1:4318/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, args }),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error);
    return result;
  }
  throw new Error(
    "Open NOEMA as a desktop application using npm run tauri dev. Browser-only mode has no database.",
  );
}
export function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
