import { describe, it, expect, vi } from "vitest";
import { Autosave } from "../src/autosave";
describe("autosave", () => {
  it("coalesces pending edits and uses the returned version", async () => {
    const write = vi
      .fn()
      .mockResolvedValueOnce({ version: 2 })
      .mockResolvedValueOnce({ version: 3 });
    const save = new Autosave(1, write, () => {});
    save.enqueue({ html: "old", text: "old" });
    save.enqueue({ html: "latest", text: "latest" });
    await save.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0].text).toBe("latest");
    save.enqueue({ html: "next", text: "next" });
    await save.flush();
    expect(write.mock.calls[1][1]).toBe(2);
  });
  it("retains failed writes and retries without inventing a version", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce({ version: 1 });
    const save = new Autosave(0, write, () => {});
    save.enqueue({ html: "keep", text: "keep" });
    await expect(save.flush()).rejects.toThrow("disk full");
    await save.flush();
    expect(write.mock.calls[1][0].text).toBe("keep");
    expect(write.mock.calls[1][1]).toBe(0);
  });
  it("serializes edits made during a slow write", async () => {
    let finish!: (v: { version: number }) => void;
    const write = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            finish = r;
          }),
      )
      .mockResolvedValueOnce({ version: 2 });
    const save = new Autosave(0, write, () => {});
    save.enqueue({ html: "first", text: "first" });
    const flushing = save.flush();
    save.enqueue({ html: "second", text: "second" });
    finish({ version: 1 });
    await flushing;
    expect(write.mock.calls.map((c) => c[1])).toEqual([0, 1]);
    expect(write.mock.calls[1][0].text).toBe("second");
  });
});
