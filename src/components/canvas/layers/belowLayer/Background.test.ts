import { scheduler } from "../../../../lib";
import { Component } from "../../../../lib/Component";
import { TRect } from "../../../../utils/types/shapes";

import { Background } from "./Background";
import { TBelowLayerContext } from "./BelowLayer";
import { PointerGrid } from "./PointerGrid";

const USABLE_RECT_GAP = 248;

type TUsableRectListener = (rect: TRect) => void;

type TPathEvent = {
  type: string;
  props: Partial<TRect>;
};

type TMockPath = Path2D & {
  _path: TPathEvent[];
};

type TBackgroundFixture = {
  background: Background;
  emitUsableRect: (rect: TRect) => void;
  fillSpy: jest.SpyInstance;
  fillRectSpy: jest.SpiedFunction<CanvasRenderingContext2D["fillRect"]>;
  dispose: () => void;
};

function createBackgroundFixture(): TBackgroundFixture {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable");
  }

  let usableRectListener: TUsableRectListener | undefined;
  const graph = {
    hitTest: {
      onUsableRectUpdate(listener: TUsableRectListener): () => void {
        usableRectListener = listener;
        return () => {
          if (usableRectListener === listener) {
            usableRectListener = undefined;
          }
        };
      },
    },
  };

  const parent = new Component({}, undefined);
  parent.setContext({
    graph,
    camera: {
      getCameraState: () => ({
        relativeX: 0,
        relativeY: 0,
        relativeWidth: 1000,
        relativeHeight: 800,
        scale: 1,
      }),
      limitScaleEffect: (value: number) => value,
    },
    constants: {
      system: {
        USABLE_RECT_GAP,
        GRID_SIZE: 20,
      },
      block: {
        SCALES: [0.1, 0.5, 0.8],
      },
    },
    colors: {
      canvas: {
        belowLayerBackground: "#ffffff",
        layerBackground: "#ffffff",
        border: "#000000",
        dots: "#000000",
      },
    },
    graphCanvas: canvas,
    ctx,
    layer: {},
  } as unknown as TBelowLayerContext);

  const background = new Background({}, parent);
  const fillSpy = jest.spyOn(ctx, "fill");
  const fillRectSpy = jest.spyOn(ctx, "fillRect");

  return {
    background,
    emitUsableRect: (rect: TRect) => {
      if (!usableRectListener) {
        throw new Error("Background is not subscribed to usableRect updates");
      }
      usableRectListener(rect);
    },
    fillSpy,
    fillRectSpy,
    dispose: () => {
      Component.unmount(background);
      fillRectSpy.mockRestore();
      fillSpy.mockRestore();
    },
  };
}

function expandRect(rect: TRect): TRect {
  return {
    x: rect.x - USABLE_RECT_GAP,
    y: rect.y - USABLE_RECT_GAP,
    width: rect.width + USABLE_RECT_GAP * 2,
    height: rect.height + USABLE_RECT_GAP * 2,
  };
}

function flushBackgroundUpdate(fixture: TBackgroundFixture): void {
  scheduler.performUpdate();
  fixture.background.iterate();
}

function renderPointerGrid(fixture: TBackgroundFixture): void {
  const [pointerGridDescriptor] = fixture.background.updateChildren();
  const pointerGrid = new PointerGrid(pointerGridDescriptor.props as TRect, fixture.background);
  pointerGrid.willIterate();
  pointerGrid.render();
}

function renderGeometry(fixture: TBackgroundFixture, usableRect: TRect): TRect {
  fixture.emitUsableRect(usableRect);
  flushBackgroundUpdate(fixture);
  renderPointerGrid(fixture);

  const fillCalls = fixture.fillSpy.mock.calls;
  const path = fillCalls[fillCalls.length - 1][0] as TMockPath;
  const pathEvent = path._path[path._path.length - 1];

  const fillRectCalls = fixture.fillRectSpy.mock.calls;
  const gridCall = fillRectCalls[fillRectCalls.length - 1];
  expect(gridCall).toBeDefined();

  const expected = expandRect(usableRect);
  expect(pathEvent).toEqual({
    type: "rect",
    transform: [1, 0, 0, 1, 0, 0],
    props: expected,
  });
  expect(gridCall).toEqual([expected.x, expected.y, expected.width, expected.height]);

  return expected;
}

describe("Background geometry", () => {
  let fixture: TBackgroundFixture | undefined;

  afterEach(() => {
    fixture?.dispose();
    fixture = undefined;
  });

  it.each([
    ["initial zero coordinates", { x: 248, y: 248, width: 1800, height: 1400 }],
    ["ordinary coordinates", { x: 256, y: 256, width: 1800, height: 1400 }],
    ["negative coordinates", { x: -320, y: -160, width: 1800, height: 1400 }],
  ])("draws the expanded rectangle for %s", (_name, usableRect) => {
    fixture = createBackgroundFixture();

    expect(renderGeometry(fixture, usableRect)).toEqual(expandRect(usableRect));
  });

  it("updates both Path2D and PointerGrid when coordinates move to zero", () => {
    fixture = createBackgroundFixture();

    renderGeometry(fixture, { x: 800, y: 800, width: 200, height: 100 });
    renderGeometry(fixture, { x: 248, y: 248, width: 1800, height: 1400 });

    expect(fixture.background.getState()).toEqual(expandRect({ x: 248, y: 248, width: 1800, height: 1400 }));
  });

  it.each([
    ["x", { x: 800, y: 400, width: 200, height: 100 }, { x: 248, y: 400, width: 200, height: 100 }],
    ["y", { x: 400, y: 800, width: 200, height: 100 }, { x: 400, y: 248, width: 200, height: 100 }],
  ])("updates the independent %s coordinate to zero", (_axis, initialRect, zeroRect) => {
    fixture = createBackgroundFixture();

    renderGeometry(fixture, initialRect);
    renderGeometry(fixture, zeroRect);

    expect(fixture.background.getState()).toEqual(expandRect(zeroRect));
  });

  it("updates size changes and removal of the last content", () => {
    fixture = createBackgroundFixture();

    renderGeometry(fixture, { x: 248, y: 248, width: 1800, height: 1400 });
    renderGeometry(fixture, { x: 248, y: 248, width: 2100, height: 1700 });
    renderGeometry(fixture, { x: 800, y: 800, width: 200, height: 100 });
    renderGeometry(fixture, { x: 0, y: 0, width: 0, height: 0 });

    expect(fixture.background.getState()).toEqual(expandRect({ x: 0, y: 0, width: 0, height: 0 }));
  });

  it("keeps the latest geometry when updates arrive before the component processes state", () => {
    fixture = createBackgroundFixture();

    fixture.emitUsableRect({ x: 248, y: 400, width: 1800, height: 1400 });
    scheduler.performUpdate();
    fixture.emitUsableRect({ x: 400, y: 248, width: 2100, height: 1700 });
    flushBackgroundUpdate(fixture);
    renderPointerGrid(fixture);

    const expected = expandRect({ x: 400, y: 248, width: 2100, height: 1700 });
    expect(fixture.background.getState()).toEqual(expected);

    const fillCalls = fixture.fillSpy.mock.calls;
    const path = fillCalls[fillCalls.length - 1][0] as TMockPath;
    expect(path._path[path._path.length - 1]).toEqual({
      type: "rect",
      transform: [1, 0, 0, 1, 0, 0],
      props: expected,
    });
    const fillRectCalls = fixture.fillRectSpy.mock.calls;
    expect(fillRectCalls[fillRectCalls.length - 1]).toEqual([expected.x, expected.y, expected.width, expected.height]);
  });

  it("cancels a pending usableRect update on unmount", () => {
    fixture = createBackgroundFixture();
    fixture.emitUsableRect({ x: 248, y: 248, width: 1800, height: 1400 });
    const { background } = fixture;

    fixture.dispose();
    fixture = undefined;
    scheduler.performUpdate();

    expect(background.getState()).toEqual({});
  });
});
