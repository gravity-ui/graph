import { Component } from "../../../lib/Component";
import { ECameraScaleLevel } from "../../../services/camera/CameraService";
import { CanvasStyles } from "../../../services/canvasStyles";
import { TBlockId } from "../../../store/block/Block";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { Block, TBlock, TBlockProps } from "./Block";

type TRecordedStroke = {
  color: string;
  width: number;
  lineWidth: number;
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

class TestBlock extends Block<TBlock, TBlockProps> {
  public recordedStrokes: TRecordedStroke[] = [];

  protected subscribe(_id: TBlockId): void {
    this.state = {
      id: "block-1",
      is: "Block",
      x: 10,
      y: 20,
      width: 100,
      height: 60,
      selected: false,
      name: "Block title",
      anchors: [],
    };
  }

  public setSelected(selected: boolean): void {
    this.state.selected = selected;
  }

  public renderBodyPublic(ctx: CanvasRenderingContext2D): void {
    this.renderBody(ctx);
  }

  public renderPublic(): void {
    this.render();
  }

  public renderSchematicPublic(ctx: CanvasRenderingContext2D): void {
    this.shouldRenderText = true;
    this.renderSchematicView(ctx);
  }

  protected renderStroke(
    color: string,
    width = this.context.constants.block.BORDER_WIDTH,
    scaleWithCamera = false,
    maxWidth = 10
  ): void {
    super.renderStroke(color, width, scaleWithCamera, maxWidth);
    this.recordedStrokes.push({
      color,
      width,
      lineWidth: this.context.ctx.lineWidth,
    });
  }
}

function createTestBlock(canvasStyles: CanvasStyles): {
  block: TestBlock;
  ctx: CanvasRenderingContext2D;
} {
  const parent = new Component({}, undefined);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas 2D context is required for Block tests");
  }

  const camera = {
    isRectVisible: () => true,
    getRelative: (value: number) => value,
    getCameraScale: () => 1,
    limitScaleEffect: (value: number, max?: number) => {
      const relative = camera.getRelative(value);
      if (max !== undefined) {
        return clampNumber(relative, value, max);
      }
      return relative;
    },
  };

  parent.setContext({
    graph: {
      canvasStyles,
      cameraService: {
        getCameraBlockScaleLevel: () => ECameraScaleLevel.Schematic,
      },
    },
    root: document.createElement("div"),
    canvas,
    ctx,
    ownerDocument: document,
    camera,
    constants: {
      block: {
        BORDER_WIDTH: 3,
        SCALES: [0.125, 0.225, 0.7],
      },
      text: {
        PADDING: 10,
      },
    },
    colors: {
      block: {
        background: "#f0f0f0",
        border: "#111111",
        selectedBorder: "#ffaa00",
        text: "#222222",
      },
    },
    graphCanvas: canvas,
    layer: {},
    affectsUsableRect: true,
  } as unknown as TGraphLayerContext);

  const block = new TestBlock({ id: "block-1", font: "12px sans-serif" }, parent);
  return { block, ctx };
}

function normalizeCssColor(value: string): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is required for color normalization");
  }
  ctx.fillStyle = value;
  return String(ctx.fillStyle);
}

describe("Block canvas styles", () => {
  it("applies registered block background and text styles", () => {
    const styles = new CanvasStyles();
    styles.register({
      selector: ".block",
      style: {
        fill: {
          color: "red",
        },
        text: {
          color: "purple",
        },
      },
    });
    const { block, ctx } = createTestBlock(styles);

    let fillStyleAtFillRect = "";
    let fillStyleAtFillText = "";

    jest.spyOn(ctx, "fillRect").mockImplementation(() => {
      fillStyleAtFillRect = String(ctx.fillStyle);
    });
    jest.spyOn(ctx, "fillText").mockImplementation(() => {
      fillStyleAtFillText = String(ctx.fillStyle);
    });

    block.renderSchematicPublic(ctx);

    expect(fillStyleAtFillRect).toBe(normalizeCssColor("red"));
    expect(fillStyleAtFillText).toBe(normalizeCssColor("purple"));
  });

  it("applies selected style override for border color", () => {
    const styles = new CanvasStyles();
    styles.register({
      selector: ".block",
      style: {
        stroke: {
          color: "blue",
        },
      },
    });
    styles.register({
      selector: ".block.selected",
      style: {
        stroke: {
          color: "orange",
        },
      },
    });
    const { block, ctx } = createTestBlock(styles);

    block.setSelected(true);
    block.renderBodyPublic(ctx);

    expect(block.recordedStrokes).toHaveLength(1);
    expect(block.recordedStrokes[0].color).toBe("orange");
  });

  it("normalizes px border width and passes it to stroke renderer", () => {
    const styles = new CanvasStyles();
    styles.register({
      selector: ".block",
      style: {
        stroke: {
          color: "green",
          width: "5px",
        },
      },
    });
    const { block, ctx } = createTestBlock(styles);

    block.renderBodyPublic(ctx);

    expect(block.recordedStrokes).toHaveLength(1);
    expect(block.recordedStrokes[0].width).toBe(5);
    expect(block.recordedStrokes[0].color).toBe("green");
  });

  it("applies runtime class to dim block via opacity", () => {
    const styles = new CanvasStyles();
    styles.register({
      selector: ".block.dimmed",
      style: {
        composite: {
          opacity: 0.6,
        },
      },
    });
    const { block, ctx } = createTestBlock(styles);
    block.addStyleClass("dimmed");

    let alphaAtFillRect = 0;
    jest.spyOn(ctx, "fillRect").mockImplementation(() => {
      alphaAtFillRect = ctx.globalAlpha;
    });

    block.renderPublic();

    expect(alphaAtFillRect).toBe(0.6);
    expect(ctx.globalAlpha).toBe(1);
  });

  it("applies grouped style API for fill, stroke and text", () => {
    const styles = new CanvasStyles();
    styles.register({
      selector: ".block",
      style: {
        fill: {
          color: "red",
        },
        stroke: {
          color: "blue",
          width: "6px",
        },
        text: {
          color: "purple",
        },
      },
    });
    const { block, ctx } = createTestBlock(styles);

    let fillStyleAtFillRect = "";
    let fillStyleAtFillText = "";

    jest.spyOn(ctx, "fillRect").mockImplementation(() => {
      fillStyleAtFillRect = String(ctx.fillStyle);
    });
    jest.spyOn(ctx, "fillText").mockImplementation(() => {
      fillStyleAtFillText = String(ctx.fillStyle);
    });

    block.renderSchematicPublic(ctx);

    expect(fillStyleAtFillRect).toBe(normalizeCssColor("red"));
    expect(fillStyleAtFillText).toBe(normalizeCssColor("purple"));
    expect(block.recordedStrokes).toHaveLength(1);
    expect(block.recordedStrokes[0].color).toBe("blue");
    expect(block.recordedStrokes[0].width).toBe(6);
  });

  it("supports border scale dependency on camera", () => {
    const styles = new CanvasStyles();
    styles.register({
      selector: ".block",
      style: {
        stroke: {
          color: "blue",
          width: 3,
        },
      },
    });
    styles.register({
      selector: ".block.selected",
      style: {
        stroke: {
          width: 4,
          scaleWithCamera: true,
        },
      },
    });
    const { block, ctx } = createTestBlock(styles);
    // emulate zoom-out where relative width usually grows
    (block.context.camera.getRelative as unknown as (n: number) => number) = (n) => n * 2;

    block.renderBodyPublic(ctx);
    expect(block.recordedStrokes[0].width).toBe(6);
    expect(block.recordedStrokes[0].lineWidth).toBe(6);

    block.recordedStrokes = [];
    block.setSelected(true);
    block.renderBodyPublic(ctx);
    expect(block.recordedStrokes[0].width).toBe(4);
    expect(block.recordedStrokes[0].lineWidth).toBe(4);
  });

  it("limits compensated stroke width via maxWidth", () => {
    const styles = new CanvasStyles();
    styles.register({
      selector: ".block",
      style: {
        stroke: {
          color: "blue",
          width: 3,
          maxWidth: 8,
        },
      },
    });
    const { block, ctx } = createTestBlock(styles);
    (block.context.camera.getRelative as unknown as (n: number) => number) = (n) => n * 4;

    block.renderBodyPublic(ctx);

    expect(block.recordedStrokes[0].lineWidth).toBe(8);
  });
});
