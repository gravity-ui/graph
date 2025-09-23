import { MultipleSelectionBucket } from "./MultipleSelectionBucket";
import { ESelectionStrategy, TSelectionDiff } from "./types";

describe("MultipleSelectionBucket", () => {
  let bucket: MultipleSelectionBucket<string>;
  let lastPayload: TSelectionDiff<string> | null = null;
  let defaultActionCalled = false;

  beforeEach(() => {
    lastPayload = null;
    defaultActionCalled = false;
    bucket = new MultipleSelectionBucket<string>("block", (payload, defaultAction) => {
      lastPayload = payload;
      defaultAction();
      defaultActionCalled = true;
      return true;
    });
  });

  it("selects and deselects with REPLACE", () => {
    bucket.updateSelection(["a", "b"], true, ESelectionStrategy.REPLACE);
    expect(bucket.$selected.value).toEqual(new Set(["a", "b"]));
    expect(lastPayload).toEqual({
      list: ["a", "b"],
      changes: { add: ["a", "b"], removed: [] },
    });
    bucket.updateSelection(["a"], false, ESelectionStrategy.SUBTRACT);
    expect(bucket.$selected.value).toEqual(new Set(["b"]));
    expect(lastPayload).toEqual({
      list: ["b"],
      changes: { add: [], removed: ["a"] },
    });
  });

  it("appends and toggles selection", () => {
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    expect(lastPayload).toEqual({
      list: ["a"],
      changes: { add: ["a"], removed: [] },
    });
    bucket.updateSelection(["b"], true, ESelectionStrategy.APPEND);
    expect(lastPayload).toEqual({
      list: ["a", "b"],
      changes: { add: ["b"], removed: [] },
    });
    bucket.updateSelection(["a"], true, ESelectionStrategy.TOGGLE);
    expect(lastPayload).toEqual({
      list: ["b"],
      changes: { add: [], removed: ["a"] },
    });
  });

  it("reset clears all selection", () => {
    bucket.updateSelection(["a", "b"], true, ESelectionStrategy.REPLACE);
    bucket.reset();
    expect(bucket.$selected.value.size).toBe(0);
    expect(lastPayload).toEqual({
      list: [],
      changes: { add: [], removed: ["a", "b"] },
    });
  });

  it("isSelected returns correct state", () => {
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    expect(bucket.isSelected("a")).toBe(true);
    expect(bucket.isSelected("b")).toBe(false);
  });

  it("does nothing if ids is empty", () => {
    bucket.updateSelection([], true, ESelectionStrategy.APPEND);
    expect(bucket.$selected.value.size).toBe(0);
    expect(lastPayload).toBeNull();
  });

  it("handles duplicate ids gracefully", () => {
    bucket.updateSelection(["a", "a", "b"], true, ESelectionStrategy.APPEND);
    expect(bucket.$selected.value).toEqual(new Set(["a", "b"]));
    expect(lastPayload).toEqual({
      list: ["a", "b"],
      changes: { add: ["a", "b"], removed: [] },
    });
  });

  it("SUBTRACT does nothing if id is not selected", () => {
    bucket.updateSelection(["a"], false, ESelectionStrategy.SUBTRACT);
    expect(bucket.$selected.value.size).toBe(0);
    expect(lastPayload).toBeNull();
  });

  it("APPEND with already selected ids does not emit event", () => {
    bucket.updateSelection(["a"], true, ESelectionStrategy.APPEND);
    lastPayload = null;
    bucket.updateSelection(["a"], true, ESelectionStrategy.APPEND);
    expect(lastPayload).toBeNull();
  });

  it("REPLACE with empty ids clears selection", () => {
    bucket.updateSelection(["a"], true, ESelectionStrategy.APPEND);
    bucket.updateSelection([], true, ESelectionStrategy.REPLACE);
    expect(bucket.$selected.value.size).toBe(0);
  });

  it("does not update selection if onSelectionChange returns false", () => {
    const bucket2 = new MultipleSelectionBucket<string>("block", () => false);
    bucket2.updateSelection(["a"], true, ESelectionStrategy.APPEND);
    expect(bucket2.$selected.value.size).toBe(0);
  });

  it("treats '1' and 1 as different ids", () => {
    // @ts-expect-error: for test purposes
    bucket.updateSelection(["1", 1], true, ESelectionStrategy.APPEND);
    expect(bucket.$selected.value).toEqual(new Set(["1", 1]));
  });

  it("reset does nothing if selection is already empty", () => {
    bucket.reset();
    expect(bucket.$selected.value.size).toBe(0);
    expect(lastPayload).toBeNull();
  });

  describe("TOGGLE strategy comprehensive tests", () => {
    it("toggles selection with mixed existing and new IDs", () => {
      // Initial selection
      bucket.updateSelection(["a", "b"], true, ESelectionStrategy.REPLACE);
      expect(bucket.$selected.value).toEqual(new Set(["a", "b"]));

      // Toggle: remove 'a', add 'c'
      bucket.updateSelection(["a", "c"], true, ESelectionStrategy.TOGGLE);
      expect(bucket.$selected.value).toEqual(new Set(["b", "c"]));
      expect(lastPayload).toEqual({
        list: ["b", "c"],
        changes: { add: ["c"], removed: ["a"] },
      });
    });

    it("toggle with select=false removes existing IDs", () => {
      bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
      bucket.updateSelection(["a", "b"], false, ESelectionStrategy.TOGGLE);
      // With select=false, TOGGLE should remove 'a' but not add 'b'
      expect(bucket.$selected.value).toEqual(new Set());
    });
  });

  describe("Edge cases and error conditions", () => {
    it("handles null and undefined IDs gracefully", () => {
      bucket.updateSelection([null, undefined], true, ESelectionStrategy.APPEND);
      expect(bucket.$selected.value).toEqual(new Set([null, undefined]));
    });
  });

  describe("Strategy combinations", () => {
    it("APPEND after REPLACE maintains correct state", () => {
      bucket.updateSelection(["a", "b"], true, ESelectionStrategy.REPLACE);
      bucket.updateSelection(["c", "d"], true, ESelectionStrategy.APPEND);
      expect(bucket.$selected.value).toEqual(new Set(["a", "b", "c", "d"]));
    });

    it("SUBTRACT after APPEND removes correct items", () => {
      bucket.updateSelection(["a", "b", "c"], true, ESelectionStrategy.REPLACE);
      bucket.updateSelection(["b", "d"], true, ESelectionStrategy.SUBTRACT);
      expect(bucket.$selected.value).toEqual(new Set(["a", "c"]));
    });

    it("REPLACE with empty array after complex selection", () => {
      bucket.updateSelection(["a", "b"], true, ESelectionStrategy.REPLACE);
      bucket.updateSelection(["c"], true, ESelectionStrategy.APPEND);
      bucket.updateSelection([], true, ESelectionStrategy.REPLACE);
      expect(bucket.$selected.value.size).toBe(0);
    });
  });

  describe("Callback behavior", () => {
    it("prevents selection when callback returns false", () => {
      const preventBucket = new MultipleSelectionBucket<string>("test", () => false);
      preventBucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
      expect(preventBucket.$selected.value.size).toBe(0);
    });

    it("supports callback that modifies selection", () => {
      const modifyBucket = new MultipleSelectionBucket<string>("test", (payload, defaultAction) => {
        // Modify the selection to always include 'x'
        const modifiedIds = new Set([...payload.list, "x"]);
        defaultAction(modifiedIds);
        return true;
      });

      modifyBucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
      // Note: This test shows the callback pattern, but actual modification would need bucket internals access
      expect(modifyBucket.$selected.value).toEqual(new Set(["a", "x"]));
    });
  });

  describe("Reactive behavior", () => {
    it("$selected signal updates reactively", () => {
      const values: Set<string>[] = [];

      // Subscribe to changes
      const unsubscribe = bucket.$selected.subscribe((value) => {
        values.push(new Set(value));
      });

      bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
      bucket.updateSelection(["b"], true, ESelectionStrategy.APPEND);
      bucket.reset();

      unsubscribe();

      expect(values).toHaveLength(4); // Initial + 3 changes
      expect(values[1]).toEqual(new Set(["a"]));
      expect(values[2]).toEqual(new Set(["a", "b"]));
      expect(values[3]).toEqual(new Set());
    });
  });

  describe("Silent mode", () => {
    it("silent=true prevents callback execution", () => {
      bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE, true);
      expect(lastPayload).toBeNull();
      expect(defaultActionCalled).toBe(false);
      expect(bucket.$selected.value).toEqual(new Set(["a"]));
    });

    it("silent=false executes callback normally", () => {
      bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE, false);
      expect(lastPayload).not.toBeNull();
      expect(defaultActionCalled).toBe(true);
    });
  });

  describe("Type safety", () => {
    it("works with number IDs", () => {
      const numberBucket = new MultipleSelectionBucket<number>("numbers");
      numberBucket.updateSelection([1, 2, 3], true, ESelectionStrategy.REPLACE);
      expect(numberBucket.$selected.value).toEqual(new Set([1, 2, 3]));
      expect(numberBucket.isSelected(2)).toBe(true);
      expect(numberBucket.isSelected(4)).toBe(false);
    });

    it("works with mixed string/number types", () => {
      const mixedBucket = new MultipleSelectionBucket<string | number>("mixed");
      mixedBucket.updateSelection(["a", 1, "b", 2], true, ESelectionStrategy.REPLACE);
      expect(mixedBucket.$selected.value).toEqual(new Set(["a", 1, "b", 2]));
    });
  });
});
