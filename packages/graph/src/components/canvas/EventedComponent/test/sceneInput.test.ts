import { Graph } from "../../../../graph";
import type { GraphEventMap } from "../../../../graphEvents";
import type { ChildDescriptor } from "../../../../lib/CoreComponent";
import { globalScheduler } from "../../../../lib/Scheduler";
import type { TScenePrimitive } from "../../../../lib/scene/types";
import { Layer } from "../../../../services/Layer";
import type { GraphDragOperation, GraphPinchEvent, GraphPressEvent } from "../../../../services/input/press";
import { hoverEvent, pointer, pointerRoot } from "../../../../test/pointer";
import type { TGraphComponentProps } from "../../GraphComponent";
import { Block } from "../../blocks/Block";
import type { TBlock } from "../../blocks/Block";
import { SceneComponent } from "../../scene/SceneComponent";

type TButtonProps = TGraphComponentProps & { id: string; width: number };

/** The run button of the latest mounted block. */
let button: RunButton | undefined;

/** A block's run button: a 40 x 30 rect 8 units in from its top right, on the schematic level. It stops nothing. */
class RunButton extends SceneComponent<TButtonProps> {
  public static override entityType = "runButton";

  public claimNextBackgroundDrag(operation: GraphDragOperation) {
    this.onGraphEvent(
      "dragstart",
      (event) => {
        if (event.target === this.context.graph) event.claim(operation);
      },
      { once: true }
    );
  }

  public enableDrag(updates: number[][], ended: PointerEvent[]) {
    return this.onDrag({
      isDraggable: (press) => press.shiftKey,
      onDragUpdate: ({ diffX, diffY, deltaX, deltaY }) => updates.push([diffX, diffY, deltaX, deltaY]),
      onDrop: (event) => ended.push(event),
      autopanning: false,
    });
  }

  public override getEntityId(): string {
    return this.props.id;
  }

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [];
  }

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "button", x: this.props.width - 48, y: 8, width: 40, height: 30 }];
  }
}

class ButtonBlock extends Block {
  protected override updateChildren(): ChildDescriptor[] {
    const ref = (component: RunButton): void => {
      button = component;
    };
    return [
      RunButton.create({ id: String(this.props.id), width: this.state.width }, { key: "run", ref }),
      ...super.updateChildren(),
    ];
  }
}

const blockData: TBlock = {
  id: "a",
  is: "ButtonBlock",
  name: "a",
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  anchors: [],
};

type TClientPoint = readonly [number, number];

// Scale 0.5, the camera at the origin: client = world / 2. The block spans client x 50..150, y 50..100.
/** World (272, 122): the button (world x 252..292, y 108..138). */
const BUTTON: TClientPoint = [136, 61];
/** World (160, 170): the block's body. */
const BODY: TClientPoint = [80, 85];
/** World (900, 700): nothing, the camera. */
const EMPTY: TClientPoint = [450, 350];

describe("scene input delivery", () => {
  let graph: Graph;
  let root: HTMLDivElement;
  let block: Block;
  const log: string[] = [];

  const nameOf = (target: unknown): string => {
    if (target === button) return "button";
    if (target === block) return "block";
    if (target === graph) return "graph";
    return "other";
  };

  beforeEach(() => {
    log.length = 0;
    button = undefined;
    root = pointerRoot();
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph({ settings: { blockComponents: { ButtonBlock }, dragThreshold: 2 } }, root);
    graph.start();
    graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
    graph.setEntities({ blocks: [blockData], connections: [] });
    for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
    const view = graph.rootStore.blocksList.getBlockState("a")?.getViewComponent();
    if (!button || !view) throw new Error("The button and block must be mounted");
    block = view;
  });

  afterEach(() => graph.unmount());

  const send = (type: string, [clientX, clientY]: TClientPoint, init: PointerEventInit = {}) =>
    pointer(root, type, { clientX, clientY, ...init });

  const click = (point: TClientPoint, init: PointerEventInit = {}) => {
    send("pointerdown", point, init);
    return send("pointerup", point, init);
  };

  it("cancels a one-time background drag claim when the observing component unmounts", () => {
    if (!button) throw new Error("The observing button must be mounted");
    button.claimNextBackgroundDrag({
      owner: "button",
      start: () => log.push("start"),
      cancel: () => log.push("cancel"),
      end: () => log.push("end"),
    });
    send("pointerdown", EMPTY);
    send("pointermove", [460, 350], { buttons: 1 });
    expect(log).toEqual(["start"]);

    graph.rootStore.blocksList.deleteBlocks(["a"]);
    for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
    expect(button.isMounted()).toBe(false);
    expect(log).toEqual(["start", "cancel"]);
    send("pointerup", [460, 350]);
    expect(log).toEqual(["start", "cancel"]);
  });

  it("cancels a child's drop when its block is replaced during release before reconciliation", () => {
    graph.on("dragstart", ({ claim }) =>
      claim({ owner: "button", end: () => log.push("end"), cancel: () => log.push("cancel") })
    );
    graph.on("release", () => {
      graph.blocks.deleteBlocks(["a"]);
      graph.api.addBlock({ ...blockData });
    });
    send("pointerdown", BUTTON);
    send("pointermove", [BUTTON[0] + 12, BUTTON[1]], { buttons: 1 });
    send("pointerup", BUTTON);
    expect(log).toEqual(["cancel"]);
  });

  it("routes a pinch spanning a child and its block from their common ancestor", () => {
    graph.updateSettings({ touchPolicy: "editor" });
    const first = { pointerType: "touch", pointerId: 5 };
    const second = { pointerType: "touch", pointerId: 8 };
    const record = ({ currentTarget, target, phase }: GraphPinchEvent) =>
      log.push(`${phase}:${nameOf(currentTarget)}:${nameOf(target)}`);
    button?.on("pinch", record);
    block.on("pinch", record);
    graph.on("pinch", record);
    send("pointerdown", BUTTON, first);
    send("pointerdown", BODY, second);
    send("pointercancel", BODY, second);
    send("pointerup", BUTTON, first);
    expect(log).toEqual(["start:block:block", "start:graph:block", "cancel:block:block", "cancel:graph:block"]);
  });

  it("delivers the same press through graph capture, child, block and graph with the original coordinates", () => {
    const events: GraphPressEvent[] = [];
    const record = (event: GraphPressEvent) => {
      events.push(event);
      log.push(nameOf(event.currentTarget));
    };
    graph.on("press", record, { capture: true });
    button?.on("press", record);
    block.on("press", record);
    graph.on("press", record);
    graph.getGraphLayer().$.camera?.on("press", () => log.push("camera"));
    const hit = jest.spyOn(graph, "getElementOverPoint");
    const native = send("pointerdown", [136.25, 61.5], { ctrlKey: true });
    expect(hit).toHaveBeenCalledTimes(1);

    expect(log).toEqual(["graph", "button", "block", "graph"]);
    expect(new Set(events).size).toBe(1);
    const [press] = events;
    expect(press.target === button && press.currentTarget === null).toBe(true);
    expect(press.event === native && press.pointers[0] === native && press.event.ctrlKey).toBe(true);
    expect(press.point).toEqual({ canvas: { x: 136.25, y: 61.5 }, world: { x: 272.5, y: 123 } });
  });

  it.each(["mouse", "pen", "touch"])(
    "keeps the hit target and native release throughout a %s activation",
    (pointerType) => {
      const releases: PointerEvent[] = [];
      for (const type of ["press", "release", "click", "dblclick"] as const) {
        button?.on(type, (event) => log.push(`button:${type}:${nameOf(event.target)}`));
        block.on(type, (event) => {
          log.push(`block:${type}:${nameOf(event.target)}`);
          if (type === "click") releases.push(event.event);
        });
      }
      const first = click(BUTTON, { pointerType });
      const second = click(BUTTON, { pointerType });
      const types = ["press", "release", "click", "press", "release", "click", "dblclick"];
      expect(log).toEqual(types.flatMap((type) => [`button:${type}:button`, `block:${type}:button`]));
      expect(releases[0] === first && releases[1] === second).toBe(true);
    }
  );

  it("lets user listeners inspect selection before the block's default or veto it from the graph", () => {
    const state = graph.rootStore.blocksList.getBlockState("a");
    block.on("click", () => log.push(`block:${state?.selected}`));
    graph.on(
      "click",
      (event) => {
        log.push(`graph:${state?.selected}`);
        event.preventDefault();
      },
      { once: true }
    );
    click(BUTTON);
    expect(log).toEqual(["block:false", "graph:false"]);
    expect(state?.selected).toBe(false);
    click(BODY);
    expect(log).toEqual(["block:false", "graph:false", "block:false"]);
    expect(state?.selected).toBe(true);
  });

  it("keeps an ancestor's click default off a stopped child path, while the target can run its own default", () => {
    const state = graph.rootStore.blocksList.getBlockState("a");
    button?.on("click", (event) => event.stopPropagation());
    block.on("click", (event) => {
      log.push("block");
      event.stopPropagation();
    });
    graph.on("click", () => log.push("graph"));
    click(BUTTON);
    expect(log).toEqual([]);
    expect(state?.selected).toBe(false);
    click(BODY);
    expect(log).toEqual(["block"]);
    expect(state?.selected).toBe(true);
  });

  it("gives a draggable child its own claimed updates in world units and its initiating release", () => {
    const updates: number[][] = [];
    const ended: PointerEvent[] = [];
    const stop = button?.enableDrag(updates, ended);
    send("pointerdown", BUTTON, { shiftKey: true });
    send("pointermove", [140, 62], { buttons: 1 });
    send("pointermove", [141, 64], { buttons: 1 });
    const release = send("pointerup", [141, 64]);
    expect(updates).toEqual([
      [8, 2, 8, 2],
      [10, 6, 2, 4],
    ]);
    expect(ended[0] === release).toBe(true);
    expect(graph.cameraService.getCameraState()).toMatchObject({ x: 0, y: 0 });
    stop?.();
    send("pointerdown", BUTTON, { shiftKey: true });
    send("pointermove", [140, 62], { buttons: 1 });
    send("pointerup", [140, 62]);
    expect(ended).toHaveLength(1);
  });

  it("addresses the graph on empty space and respects subscription lifetime and scene level", () => {
    const ctrl = new AbortController();
    const removed = jest.fn();
    graph.on("press", removed, { signal: ctrl.signal });
    ctrl.abort();
    graph.on("press", () => log.push("wrong level"), { inScale: ["minimalistic"] });
    graph.on("press", removed);
    graph.off("press", removed);
    graph.on("press", (event) => log.push(nameOf(event.target)), { capture: true });
    graph.on("press", () => log.push("once"), { once: true, inScale: ["schematic"] });
    click(EMPTY);
    click(EMPTY);
    expect(log).toEqual(["graph", "once", "graph"]);
    expect(removed).not.toHaveBeenCalled();
  });

  it("leaves native HTML controls and compatibility events outside graph gestures", () => {
    const control = root.appendChild(document.createElement("button"));
    graph.on("press", () => log.push("press"));
    graph.on("click", () => log.push("click"));
    pointer(control, "pointerdown");
    pointer(control, "pointerup");
    for (const type of ["mousedown", "mouseup", "click", "dblclick"]) {
      root.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    }
    expect(log).toEqual([]);
  });

  it("subscribes a layer while attached and releases its click veto on removal", () => {
    class EditorLayer extends Layer {
      protected override afterInit() {
        super.afterInit();
        this.onGraphEvent("click", (event) => {
          log.push("layer");
          event.preventDefault();
        });
      }
    }
    const layer = graph.addLayer(EditorLayer, {});
    const state = graph.rootStore.blocksList.getBlockState("a");
    click(BODY);
    expect(log).toEqual(["layer"]);
    expect(state?.selected).toBe(false);
    graph.removeLayer(layer);
    click(BODY);
    expect(log).toEqual(["layer"]);
    expect(state?.selected).toBe(true);
  });

  it("scopes root input to each running graph and reattaches once after stop", () => {
    graph.on("press", () => log.push("first"));
    const otherRoot = root.appendChild(document.createElement("div"));
    const other = new Graph({}, otherRoot);
    try {
      other.start();
      other.on("press", () => log.push("second"));
      pointer(otherRoot, "pointerdown");
      pointer(otherRoot, "pointerup");
      graph.stop();
      click(EMPTY);
      graph.start();
      graph.start();
      click(EMPTY);
      expect(log).toEqual(["second", "first"]);
    } finally {
      other.unmount();
    }
  });

  it("filters component hover at delivery and keeps once pending until its level matches", () => {
    const controller = new AbortController();
    const cancelled = jest.fn();
    block.on("pointerenter", cancelled, { signal: controller.signal });
    controller.abort();
    const entered = jest.fn();
    block.on("pointerenter", entered, { inScale: ["detailed"], once: true });

    block.dispatchEvent(hoverEvent("pointerenter", block));
    expect(entered).not.toHaveBeenCalled();
    graph.cameraService.set({ scale: 1 });
    block.dispatchEvent(hoverEvent("pointerenter", block));
    block.dispatchEvent(hoverEvent("pointerenter", block));
    expect(entered).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();
  });

  it("keeps a hover transition's native sample and both scene targets on the graph and component paths", () => {
    send("pointermove", [123, 66]);
    graph.scheduler.performUpdate();
    const transitions: Array<GraphEventMap["pointerenter" | "pointerleave" | "pointerover" | "pointerout"]> = [];
    for (const type of ["pointerleave", "pointerout", "pointerenter", "pointerover"] as const) {
      const record = (event: GraphEventMap[typeof type]) => {
        transitions.push(event);
        log.push(`${nameOf(event.currentTarget)}:${event.type}:${nameOf(event.target)}:${nameOf(event.relatedTarget)}`);
      };
      graph.on(type, record);
      block.on(type, record);
      button?.on(type, record);
    }
    const native = send("pointermove", BUTTON);
    graph.scheduler.performUpdate();
    expect(log).toEqual([
      "graph:pointerleave:block:button",
      "block:pointerleave:block:button",
      "graph:pointerout:block:button",
      "block:pointerout:block:button",
      "graph:pointerenter:button:block",
      "button:pointerenter:button:block",
      "block:pointerenter:button:block",
      "graph:pointerover:button:block",
      "button:pointerover:button:block",
      "block:pointerover:button:block",
    ]);
    expect(
      transitions.every(
        (event) =>
          event.sourceEvent === native &&
          event.cause === "pointer" &&
          !event.pointerPressed &&
          event.currentTarget === null
      )
    ).toBe(true);
    expect(new Set(transitions).size).toBe(4);
  });
});
