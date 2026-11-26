import type { TGraphComponentProps } from "../../../components/canvas/GraphComponent";
import { Block } from "../../../components/canvas/blocks/Block";
import type { TBlock } from "../../../components/canvas/blocks/Block";
import { SceneComponent } from "../../../components/canvas/scene/SceneComponent";
import { frames } from "../../../components/canvas/scene/test/utils/sceneTestKit";
import { Graph } from "../../../graph";
import type { ChildDescriptor } from "../../../lib/CoreComponent";
import type { TScenePrimitive } from "../../../lib/scene/types";
import { ECanDrag } from "../../../store/settings";
import type { TGraphSettingsPatch } from "../../../store/settings";

type TButtonProps = TGraphComponentProps & { id: string; width: number };

/** The run buttons of the mounted blocks, by block id. */
const buttons = new Map<string, RunButton>();

/** A block's run button: a 40 x 30 rect 8 units in from its top right, on the schematic level. It is not draggable. */
class RunButton extends SceneComponent<TButtonProps> {
  public static override entityType = "runButton";

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
    const id = String(this.props.id);
    const ref = (component: RunButton): void => {
      buttons.set(id, component);
    };
    return [RunButton.create({ id, width: this.state.width }, { key: "run", ref }), ...super.updateChildren()];
  }
}

const blockAt = (id: string, x: number): TBlock => ({
  id,
  is: "ButtonBlock",
  name: id,
  x,
  y: 100,
  width: 200,
  height: 100,
  anchors: [],
});

type TClientPoint = readonly [number, number];

// Scale 0.5, the camera at the origin: client = world / 2. Block a spans client x 50..150, block b x 200..300.
/** World (272, 122): block a's button (world x 252..292, y 108..138). */
const BUTTON_A: TClientPoint = [136, 61];
/** The pointer's move while the button is held, in client px: 80 x 40 world units at scale 0.5. */
const MOVE: TClientPoint = [40, 20];

describe("a press on a child that is not draggable", () => {
  let graph: Graph;
  let root: HTMLDivElement;
  /** The press events that reached block a's button and block a, as `component:type`. */
  let log: string[];

  const blockView = (id: string): Block | undefined => graph.rootStore.blocksList.getBlockState(id)?.getViewComponent();

  const nameOf = (component: unknown): string => {
    if (component === blockView("a")) return "a";
    if (component === blockView("b")) return "b";
    if (component === buttons.get("a")) return "button a";
    return "other";
  };

  function mount(settings: TGraphSettingsPatch): void {
    log = [];
    buttons.clear();
    root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    document.body.append(root);
    graph = new Graph({ settings: { blockComponents: { ButtonBlock }, dragThreshold: 0, ...settings } }, root);
    graph.start();
    graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
    graph.setEntities({ blocks: [blockAt("a", 100), blockAt("b", 400)], connections: [] });
    frames(4);
    const button = buttons.get("a");
    const block = blockView("a");
    if (!button || !block) throw new Error("block a or its button did not mount");
    button.on("press", () => log.push("button:press"));
    block.on("press", () => log.push("block:press"));
    graph.on("press", () => log.push("graph:press"));
  }

  function pressAndDrag(point: TClientPoint, button = 0): string[] {
    const init = { pointerId: 1, pointerType: "mouse", bubbles: true, cancelable: true, button };
    const buttons = button === 1 ? 4 : 1;
    const clientX = point[0] + MOVE[0];
    const clientY = point[1] + MOVE[1];
    root.dispatchEvent(new PointerEvent("pointerdown", { ...init, clientX: point[0], clientY: point[1], buttons }));
    document.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX, clientY, buttons }));
    const dragged = graph.dragService.$state.value.components.map(nameOf);
    document.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX, clientY, buttons: 0 }));
    return dragged;
  }

  const positionOf = (id: string): [number, number] => {
    const state = graph.rootStore.blocksList.getBlockState(id);
    return [state?.x ?? NaN, state?.y ?? NaN];
  };

  const cameraPosition = (): [number, number] => {
    const { x, y } = graph.cameraService.getCameraState();
    return [x, y];
  };

  afterEach(() => {
    graph.unmount();
    root.remove();
    jest.restoreAllMocks();
  });

  describe("DragService", () => {
    // The camera's drag is off: DragService alone decides about the press.

    it("delivers press to child and block, then drags only that block in ALL", () => {
      mount({ canDrag: ECanDrag.ALL, canDragCamera: false });
      expect(pressAndDrag(BUTTON_A)).toEqual(["a"]);
      expect(positionOf("a")).toEqual([180, 140]);
      expect(positionOf("b")).toEqual([400, 100]);
      expect(log).toEqual(["button:press", "block:press", "graph:press"]);
    });

    it("drags the selection for a press on a child of a selected block in ONLY_SELECTED", () => {
      mount({ canDrag: ECanDrag.ONLY_SELECTED, canDragCamera: false });
      graph.api.selectBlocks(["a", "b"], true);
      frames(2);
      expect(pressAndDrag(BUTTON_A)).toEqual(["a", "b"]);
      expect(positionOf("a")).toEqual([180, 140]);
      expect(positionOf("b")).toEqual([480, 140]);
      expect(log).toEqual(["button:press", "block:press", "graph:press"]);
    });

    it("drags nothing for a press on a child of an unselected block in ONLY_SELECTED, and stops nothing", () => {
      // Characterization: the same as a press on the body of an unselected block.
      mount({ canDrag: ECanDrag.ONLY_SELECTED, canDragCamera: false });
      graph.api.selectBlocks(["b"], true);
      frames(2);
      expect(pressAndDrag(BUTTON_A)).toEqual([]);
      expect(positionOf("a")).toEqual([100, 100]);
      expect(positionOf("b")).toEqual([400, 100]);
      expect(log).toEqual(["button:press", "block:press", "graph:press"]);
    });

    it("starts no drag when the resolved component is not available, and stops nothing", () => {
      mount({ canDrag: ECanDrag.ALL, canDragCamera: false });
      const block = blockView("a");
      if (!block) throw new Error("block a did not mount");
      jest.spyOn(block, "isEntityAvailable").mockReturnValue(false);
      expect(pressAndDrag(BUTTON_A)).toEqual([]);
      expect(positionOf("a")).toEqual([100, 100]);
      expect(log).toEqual(["button:press", "block:press", "graph:press"]);
    });
  });

  describe("Camera", () => {
    function mountCamera(settings: TGraphSettingsPatch): void {
      mount({ canDragCamera: true, ...settings });
    }

    it("does not pan for a press on a child of a draggable block", () => {
      mountCamera({ canDrag: ECanDrag.ALL });
      pressAndDrag(BUTTON_A);
      expect(cameraPosition()).toEqual([0, 0]);
    });

    it.each([
      ["NONE, where no block is draggable", ECanDrag.NONE],
      ["ONLY_SELECTED, with the block unselected", ECanDrag.ONLY_SELECTED],
    ])("pans for a press on a child whose chain has nothing draggable: %s", (_name: string, canDrag: ECanDrag) => {
      // Characterization: the same as a press on the body of a block that is not draggable.
      mountCamera({ canDrag });
      pressAndDrag(BUTTON_A);
      expect(cameraPosition()).toEqual(MOVE);
    });

    it("pans for a middle-button press on a child of a draggable block", () => {
      // Characterization: the middle button pans whatever is under the pointer.
      mountCamera({ canDrag: ECanDrag.ALL });
      pressAndDrag(BUTTON_A, 1);
      expect(cameraPosition()).toEqual(MOVE);
    });
  });
});
