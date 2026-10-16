export type Draft = { html: string; text: string; snapshot?: boolean };
// Serial writes and optimistic versions protect against slow writes and concurrent windows.
export class Autosave<T extends object = Draft> {
  private pending: T | null = null;
  private active: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  public error: unknown = null;
  constructor(
    private version: number,
    private persist: (
      draft: T,
      version: number,
    ) => Promise<{ version: number }>,
    private status: (state: "pending" | "saving" | "saved" | "error") => void,
  ) {}
  enqueue(draft: T) {
    this.pending = draft;
    this.status("pending");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, 400);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.active) {
      await this.active;
      if (this.pending) return this.flush();
      return;
    }
    if (!this.pending) {
      if (this.error) throw this.error;
      return;
    }
    this.active = this.drain();
    try {
      await this.active;
    } finally {
      this.active = null;
    }
  }
  private async drain() {
    while (this.pending) {
      const draft = this.pending;
      this.pending = null;
      this.status("saving");
      try {
        const result = await this.persist(draft, this.version);
        this.version = result.version;
        this.error = null;
      } catch (e) {
        this.pending = this.pending ?? draft;
        this.error = e;
        this.status("error");
        throw e;
      }
    }
    this.status("saved");
  }
}
