import { Graph } from "../../../../graph";
import { globalScheduler } from "../../../../lib/Scheduler";
import { ECanDrag } from "../../../../store/settings";
import { TBlock } from "../../blocks/Block";

const BLOCK: TBlock = {
  id: "block",
  is: "Block",
  name: "Block",
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  selected: false,
  anchors: [],
};

// The center of the block on the screen: the camera is at the origin with scale 1
const BLOCK_CENTER: [number, number] = [200, 150];

const EMPTY_POINT: [number, number] = [20, 20];

describe("GraphLayer: a press is either a click or a drag", () => {
  let root: HTMLDivElement;
  let graph: Graph;
  let onClick: jest.Mock;
  let onBlockDragStart: jest.Mock;

  function setup(settings: { dragThreshold?: number } = {}): void {
    root = document.createElement("div");
    document.body.appendChild(root);
    graph = new Graph({ blocks: [BLOCK], settings: { canDrag: ECanDrag.ALL, ...settings } }, root);
    graph.start();
    globalScheduler.performUpdate();
    graph.cameraService.set({ scale: 1 });
    onClick = jest.fn();
    onBlockDragStart = jest.fn();
    graph.on("click", onClick);
    graph.on("block-drag-start", onBlockDragStart);
  }

  afterEach(() => {
    graph.stop();
    graph.unmount();
    root.remove();
  });

  function dispatch(type: string, [x, y]: [number, number]): void {
    root.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  }

  /** Presses at `start`, moves the mouse by each offset in turn and releases where the last move ended */
  function press(start: [number, number], ...offsets: [number, number][]): void {
    const points = offsets.map(([dx, dy]): [number, number] => [start[0] + dx, start[1] + dy]);
    const end = points[points.length - 1] ?? start;
    dispatch("mousedown", start);
    points.forEach((point) => dispatch("mousemove", point));
    dispatch("mouseup", end);
    // jsdom does not follow a mouseup with a click
    dispatch("click", end);
  }

  function blockPosition(): { x: number; y: number } {
    const { x, y } = graph.blocks.getBlockState(BLOCK.id).asTBlock();
    return { x, y };
  }

  function isBlockSelected(): boolean {
    return graph.blocks.getBlockState(BLOCK.id).selected;
  }

  it("clicks a block that moved less than the threshold and does not drag it", () => {
    setup();

    press(BLOCK_CENTER, [4, 0]);

    expect(onBlockDragStart).not.toHaveBeenCalled();
    expect(blockPosition()).toEqual({ x: BLOCK.x, y: BLOCK.y });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(isBlockSelected()).toBe(true);
  });

  it("drags a block that moved by the threshold and does not click it", () => {
    setup();

    press(BLOCK_CENTER, [5, 0]);

    expect(onBlockDragStart).toHaveBeenCalledTimes(1);
    // The drag is measured from the press, so the block keeps the pressed point under the cursor
    expect(blockPosition()).toEqual({ x: BLOCK.x + 5, y: BLOCK.y });
    expect(onClick).not.toHaveBeenCalled();
    expect(isBlockSelected()).toBe(false);
  });

  it("does not click a block that was dragged and released back near the press", () => {
    setup();

    press(BLOCK_CENTER, [10, 0], [1, 0]);

    expect(onBlockDragStart).toHaveBeenCalledTimes(1);
    expect(blockPosition()).toEqual({ x: BLOCK.x + 1, y: BLOCK.y });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("clicks the camera when the press moved less than the threshold and does not pan", () => {
    setup();

    press(EMPTY_POINT, [3, 3]);

    expect(graph.cameraService.getCameraState()).toMatchObject({ x: 0, y: 0 });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not click the camera when the pan was released back near the press", () => {
    setup();

    press(EMPTY_POINT, [10, 0], [1, 0]);

    expect(graph.cameraService.getCameraState()).toMatchObject({ x: 1, y: 0 });
    expect(onClick).not.toHaveBeenCalled();
  });

  describe("with a zero threshold", () => {
    it("clicks a block released where it was pressed, even after a mousemove that did not move", () => {
      setup({ dragThreshold: 0 });

      press(BLOCK_CENTER, [0, 0]);

      expect(onBlockDragStart).not.toHaveBeenCalled();
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(isBlockSelected()).toBe(true);
    });

    it("drags a block that moved by a pixel and does not click it", () => {
      setup({ dragThreshold: 0 });

      press(BLOCK_CENTER, [1, 0]);

      expect(onBlockDragStart).toHaveBeenCalledTimes(1);
      expect(blockPosition()).toEqual({ x: BLOCK.x + 1, y: BLOCK.y });
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
