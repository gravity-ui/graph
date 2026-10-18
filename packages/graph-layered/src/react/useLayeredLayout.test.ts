import { act, renderHook, waitFor } from "@testing-library/react";

import { layeredConverter, layoutGraph } from "..";
import type { ConverterResult } from "..";

import { useLayeredLayout } from "./useLayeredLayout";
import type { UseLayeredLayoutParams } from "./useLayeredLayout";

jest.mock("..", () => ({
  ...jest.requireActual(".."),
  layoutGraph: jest.fn(),
  layeredConverter: jest.fn(),
}));

type TLayoutResult = {
  nodes: Array<{ id: string; x: number; y: number; shape?: string }>;
  edges: Array<{
    from: string;
    to: string;
    arrows?: {
      from?: boolean;
      to?: boolean;
    };
  }>;
};

type TDeferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

type TLayoutGraphMock = (params: unknown) => Promise<TLayoutResult>;
type TLayeredConverterMock = (params: unknown) => ConverterResult;
type TBlockInput = UseLayeredLayoutParams["blocks"][number];
type TConnectionInput = UseLayeredLayoutParams["connections"][number];

const mockedLayoutGraph = layoutGraph as jest.MockedFunction<TLayoutGraphMock>;
const mockedLayeredConverter = layeredConverter as jest.MockedFunction<TLayeredConverterMock>;

const baseBlocks: TBlockInput[] = [
  { id: "a", width: 100, height: 50 },
  { id: "b", width: 100, height: 50 },
];

const baseConnections: TConnectionInput[] = [{ sourceBlockId: "a", targetBlockId: "b" }];

const baseLayoutResult: TLayoutResult = {
  nodes: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 200, y: 100 },
  ],
  edges: [{ from: "a", to: "b" }],
};

const convertedResult: ConverterResult = {
  blocks: {
    a: { x: 0, y: 0 },
    b: { x: 200, y: 100 },
  },
  edges: {
    "a/b": {
      points: [
        { x: 100, y: 25 },
        { x: 200, y: 125 },
      ],
    },
  },
};

function createDeferred<T>(): TDeferred<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: Error) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

describe("useLayeredLayout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLayeredConverter.mockReturnValue(convertedResult);
  });

  it("returns converted layout result after successful calculation", async () => {
    const deferred = createDeferred<TLayoutResult>();
    mockedLayoutGraph.mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(() =>
      useLayeredLayout({
        blocks: baseBlocks,
        connections: baseConnections,
      })
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.result).toBeNull();

    await act(async () => {
      deferred.resolve(baseLayoutResult);
      await deferred.promise;
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.result).toEqual(convertedResult);
    expect(mockedLayeredConverter).toHaveBeenCalledTimes(1);
  });

  it("sets isLoading back to true when inputs change", async () => {
    const firstDeferred = createDeferred<TLayoutResult>();
    const secondDeferred = createDeferred<TLayoutResult>();

    mockedLayoutGraph.mockReturnValueOnce(firstDeferred.promise).mockReturnValueOnce(secondDeferred.promise);

    const { result, rerender } = renderHook(
      ({ blocks }) =>
        useLayeredLayout({
          blocks,
          connections: baseConnections,
        }),
      {
        initialProps: { blocks: baseBlocks },
      }
    );

    await act(async () => {
      firstDeferred.resolve(baseLayoutResult);
      await firstDeferred.promise;
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      rerender({
        blocks: [...baseBlocks, { id: "c", width: 100, height: 50 }],
      });
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      secondDeferred.resolve(baseLayoutResult);
      await secondDeferred.promise;
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("passes an explicit block level to the layout instead of the computed one", async () => {
    const deferred = createDeferred<TLayoutResult>();
    mockedLayoutGraph.mockReturnValueOnce(deferred.promise);

    const blocks = [baseBlocks[0], { ...baseBlocks[1], level: 3 }];

    renderHook(() => useLayeredLayout({ blocks, connections: baseConnections }));

    expect(mockedLayoutGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [expect.objectContaining({ id: "a", level: 0 }), expect.objectContaining({ id: "b", level: 3 })],
      })
    );

    await act(async () => {
      deferred.resolve(baseLayoutResult);
      await deferred.promise;
    });
  });

  it("calls onError and clears loading state when layout calculation fails", async () => {
    const deferred = createDeferred<TLayoutResult>();
    const onError = jest.fn<void, [Error]>();
    const error = new Error("layout failed");

    mockedLayoutGraph.mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(() =>
      useLayeredLayout({
        blocks: baseBlocks,
        connections: baseConnections,
        onError,
      })
    );

    await act(async () => {
      deferred.reject(error);
      try {
        await deferred.promise;
      } catch {}
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(onError).toHaveBeenCalledWith(error);
    expect(result.current.result).toBeNull();
  });

  it("does not restart the layout for inline inputs that describe the same layout", async () => {
    mockedLayoutGraph.mockResolvedValue(baseLayoutResult);

    const { result, rerender } = renderHook(() =>
      useLayeredLayout({
        blocks: [
          { id: "a", width: 100, height: 50 },
          { id: "b", width: 100, height: 50 },
        ],
        connections: [{ sourceBlockId: "a", targetBlockId: "b" }],
        layoutOptions: { nodeVerticalGap: 120 },
        onError: () => {},
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    rerender();
    rerender();
    await act(async () => {});

    expect(mockedLayoutGraph).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
  });

  it("restarts the layout when an option value changes", async () => {
    mockedLayoutGraph.mockResolvedValue(baseLayoutResult);

    const { result, rerender } = renderHook(
      ({ gap }) =>
        useLayeredLayout({ blocks: baseBlocks, connections: baseConnections, layoutOptions: { nodeVerticalGap: gap } }),
      { initialProps: { gap: 120 } }
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    rerender({ gap: 200 });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockedLayoutGraph).toHaveBeenCalledTimes(2);
    expect(mockedLayoutGraph).toHaveBeenLastCalledWith(expect.objectContaining({ options: { nodeVerticalGap: 200 } }));
  });

  it("reports errors to the latest onError without restarting the layout", async () => {
    const deferred = createDeferred<TLayoutResult>();
    mockedLayoutGraph.mockReturnValueOnce(deferred.promise);
    const firstOnError = jest.fn<void, [Error]>();
    const latestOnError = jest.fn<void, [Error]>();

    const { rerender } = renderHook(
      ({ onError }) => useLayeredLayout({ blocks: baseBlocks, connections: baseConnections, onError }),
      { initialProps: { onError: firstOnError } }
    );
    rerender({ onError: latestOnError });

    await act(async () => {
      deferred.reject(new Error("layout failed"));
      await deferred.promise.catch(() => {});
    });

    expect(mockedLayoutGraph).toHaveBeenCalledTimes(1);
    expect(firstOnError).not.toHaveBeenCalled();
    expect(latestOnError).toHaveBeenCalledWith(expect.objectContaining({ message: "layout failed" }));
  });

  it("leaves port-only connections out of the layout", async () => {
    mockedLayoutGraph.mockResolvedValue(baseLayoutResult);
    const connections = [...baseConnections, { id: "ports" }];

    const { result } = renderHook(() => useLayeredLayout({ blocks: baseBlocks, connections }));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockedLayoutGraph).toHaveBeenCalledWith(expect.objectContaining({ edges: [{ from: "a", to: "b" }] }));
    expect(mockedLayeredConverter).toHaveBeenCalledWith(expect.objectContaining({ connections }));
  });
});
