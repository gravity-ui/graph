import { MultipleSelectionBucket } from "./MultipleSelectionBucket";
import { ESelectionStrategy } from "./types";

describe("MultipleSelectionBucket", () => {
  let bucket: MultipleSelectionBucket<string>;
  let lastPayload: any = null;
  beforeEach(() => {
    lastPayload = null;
    bucket = new MultipleSelectionBucket<string>("block", (payload) => {
      lastPayload = payload;
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
});
