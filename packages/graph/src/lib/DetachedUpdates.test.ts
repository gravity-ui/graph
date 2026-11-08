import { DetachedUpdates, TDetachedEntry } from "./DetachedUpdates";

function entry(apply: () => void): TDetachedEntry {
  return { slot: -1, appliedFrame: -1, apply };
}

describe("DetachedUpdates", () => {
  it("applies each queued entry once, in order", () => {
    const log: string[] = [];
    const queue = new DetachedUpdates();
    const a = entry(() => log.push("a"));
    const b = entry(() => log.push("b"));
    queue.enqueue(a);
    queue.enqueue(b);
    queue.enqueue(a);
    expect(queue.flush()).toBe(true);
    expect(log).toEqual(["a", "b"]);
    expect(queue.flush()).toBe(false);
    expect(log).toEqual(["a", "b"]);
  });

  it("forgets deleted entries", () => {
    const log: string[] = [];
    const queue = new DetachedUpdates();
    const a = entry(() => log.push("a"));
    queue.enqueue(a);
    queue.delete(a);
    expect(queue.flush()).toBe(false);
    expect(log).toEqual([]);
    expect(a.slot).toBe(-1);
  });

  it("applies entries queued while it runs", () => {
    const log: string[] = [];
    const queue = new DetachedUpdates();
    const b = entry(() => log.push("b"));
    const a = entry(() => {
      log.push("a");
      queue.enqueue(b);
    });
    queue.enqueue(a);
    queue.flush();
    expect(log).toEqual(["a", "b"]);
  });

  it("keeps an entry that asks again after applying in this frame for the next frame", () => {
    const log: string[] = [];
    const queue = new DetachedUpdates();
    const a: TDetachedEntry = entry(() => {
      log.push("a");
      queue.enqueue(a);
    });
    queue.beginFrame();
    queue.enqueue(a);
    expect(queue.flush()).toBe(true);
    expect(queue.flush()).toBe(false);
    expect(log).toEqual(["a"]);
    queue.beginFrame();
    expect(queue.flush()).toBe(true);
    expect(log).toEqual(["a", "a"]);
  });

  it("ignores a flush started while it runs", () => {
    const log: string[] = [];
    const queue = new DetachedUpdates();
    const a = entry(() => log.push(`inner:${queue.flush()}`));
    const b = entry(() => log.push("b"));
    queue.enqueue(a);
    queue.enqueue(b);
    queue.flush();
    expect(log).toEqual(["inner:false", "b"]);
  });

  it("keeps the entries behind a failed update queued", () => {
    const log: string[] = [];
    const queue = new DetachedUpdates();
    const a = entry(() => {
      throw new Error("boom");
    });
    const b = entry(() => log.push("b"));
    queue.enqueue(a);
    queue.enqueue(b);
    expect(() => queue.flush()).toThrow("boom");
    expect(queue.flush()).toBe(true);
    expect(log).toEqual(["b"]);
  });

  it("applies a failed entry again when it asks again, like a tree node whose preparation threw", () => {
    const log: string[] = [];
    const queue = new DetachedUpdates();
    let fail = true;
    const a = entry(() => {
      if (fail) throw new Error("boom");
      log.push("a");
    });
    queue.enqueue(a);
    expect(() => queue.flush()).toThrow("boom");
    // Not retried on its own: a broken update would otherwise throw in every frame.
    expect(queue.flush()).toBe(false);
    fail = false;
    queue.beginFrame();
    queue.enqueue(a);
    expect(queue.flush()).toBe(true);
    expect(log).toEqual(["a"]);
  });

  it("keeps the order and slots of the entries behind a failed update", () => {
    const log: string[] = [];
    const queue = new DetachedUpdates();
    const a = entry(() => {
      throw new Error("boom");
    });
    const b = entry(() => log.push("b"));
    const c = entry(() => log.push("c"));
    const d = entry(() => log.push("d"));
    for (const item of [a, b, c, d]) queue.enqueue(item);
    queue.delete(c);
    expect(() => queue.flush()).toThrow("boom");
    expect([b.slot, c.slot, d.slot]).toEqual([0, -1, 1]);
    queue.delete(b);
    expect(queue.flush()).toBe(true);
    expect(log).toEqual(["d"]);
  });

  it("clear drops every entry", () => {
    const log: string[] = [];
    const queue = new DetachedUpdates();
    const a = entry(() => log.push("a"));
    queue.enqueue(a);
    queue.clear();
    expect(a.slot).toBe(-1);
    expect(queue.flush()).toBe(false);
    queue.enqueue(a);
    expect(queue.flush()).toBe(true);
  });
});
