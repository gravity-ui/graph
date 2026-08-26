import { act, renderHook, waitFor } from "@testing-library/react";

import { layeredConverter } from "../converters/layeredConverter";
import { layoutGraph } from "../layout";
import type { ConverterResult } from "../types";

import { useLayeredLayout } from "./useLayeredLayout";
import type { UseLayeredLayoutParams } from "./useLayeredLayout";

jest.mock("../layout", () => ({
  layoutGraph: jest.fn(),
}));

jest.mock("../converters/layeredConverter", () => ({
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
});
