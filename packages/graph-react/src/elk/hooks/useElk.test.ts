import { act, renderHook, waitFor } from "@testing-library/react";
import type { ELK, ElkNode } from "elkjs";

import { useElk } from "./useElk";

function elkWithLayout(layout: ELK["layout"]): ELK {
  return {
    layout,
    terminateWorker: () => {},
    knownLayoutAlgorithms: () => Promise.resolve([]),
    knownLayoutOptions: () => Promise.resolve([]),
    knownLayoutCategories: () => Promise.resolve([]),
  };
}

test("minimal ELK output converts, and loading restarts for a new request", async () => {
  let finish: ((node: ElkNode) => void) | undefined;
  const elk = elkWithLayout(
    () =>
      new Promise<ElkNode>((resolve) => {
        finish = resolve;
      })
  );
  const { result, rerender, unmount } = renderHook(({ config }) => useElk(config, elk), {
    initialProps: { config: { id: "first" } },
  });
  expect(result.current.isLoading).toBe(true);
  await act(async () => {
    finish?.({ id: "first" });
  });
  expect(result.current).toEqual({ result: { blocks: {}, edges: {} }, isLoading: false });
  rerender({ config: { id: "second" } });
  expect(result.current.isLoading).toBe(true);
  await act(async () => {
    finish?.({ id: "second" });
  });
  expect(result.current.isLoading).toBe(false);
  unmount();
});

test("failed layouts allow options without an onError callback", async () => {
  const elk = elkWithLayout(() => Promise.reject(new Error("layout failed")));
  const options = {};
  const config = { id: "root" };
  const { result } = renderHook(() => useElk(config, elk, options));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.result).toBeNull();
});

test.each([new Error("layout failed"), "layout failed"])(
  "failed replacement clears the old result and reports Error: %s",
  async (failure) => {
    const elk = elkWithLayout((config) => (config.id === "first" ? Promise.resolve(config) : Promise.reject(failure)));
    const onError = jest.fn();
    const options = { onError };
    const { result, rerender } = renderHook(({ config }) => useElk(config, elk, options), {
      initialProps: { config: { id: "first" } },
    });
    await waitFor(() => expect(result.current.result).not.toBeNull());
    rerender({ config: { id: "second" } });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.result).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toBe("layout failed");
  }
);
