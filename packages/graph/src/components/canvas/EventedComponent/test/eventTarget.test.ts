import { Graph } from "../../../../graph";
import type { ChildDescriptor } from "../../../../lib/CoreComponent";
import { globalScheduler } from "../../../../lib/Scheduler";
import type { TScenePrimitive } from "../../../../lib/scene/types";
import type { TGraphComponentProps } from "../../GraphComponent";
import { Block } from "../../blocks/Block";
import type { TBlock } from "../../blocks/Block";
import { SceneComponent } from "../../scene/SceneComponent";
import type { TGraphHoverDetail } from "../EventedComponent";
import { getEventTarget } from "../eventTarget";

/**
 * `getEventTarget(event)`: the scene component a pointer event hit, the same in every handler of its
 * parent walk and after it, while the event itself stays the native one.
 */

type TButtonProps = TGraphComponentProps & { id: string };

/** The run button of the latest mounted block. */
let button: RunButton | undefined;

/** A block's run button: a 40 x 30 rect 8 units in from its top right, on the schematic level. It stops nothing. */
class RunButton extends SceneComponent<{ width: number }, TButtonProps> {
  public static override entityType = "runButton";

  public override getEntityId(): string {
    return this.props.id;
  }

  protected override getViewData(): { width: number } {
    return { width: 200 };
  }

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [];
  }

  protected override schematic(view: { width: number }): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "button", x: view.width - 48, y: 8, width: 40, height: 30 }];
  }
}

class ButtonBlock extends Block {
  protected override updateChildren(): ChildDescriptor[] {
    const ref = (component: RunButton): void => {
      button = component;
    };
    return [RunButton.create({ id: String(this.props.id) }, { key: "run", ref }), ...super.updateChildren()];
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

const PRESS = ["mousedown", "mouseup", "click"] as const;
const HOVER = ["mouseenter", "mouseleave", "mouseover", "mouseout"] as const;

describe("getEventTarget", () => {
  let graph: Graph;
  let block: Block | undefined;
  /** The entries of the current test, as `listener:type:the target getEventTarget reads`. */
  let log: string[];

  /** A component's name for the log, by identity: "button", "block", "none" (undefined), or "other". */
  const nameOf = (component: unknown): string => {
    if (component === undefined) return "none";
    if (component === button) return "button";
    if (component === block) return "block";
    return "other";
  };

  /**
   * The camera's drag is off unless a test turns it on: the camera takes a press on a component that is not draggable
   * (its pan, `Camera.handleGraphMouseDown`), and GraphLayer gives a taken press to no component.
   */
  function mount(canDragCamera = false): void {
    log = [];
    button = undefined;
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph({ settings: { blockComponents: { ButtonBlock }, canDragCamera } }, root);
    graph.start();
    graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
    graph.setEntities({ blocks: [blockData], connections: [] });
    for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
    block = graph.rootStore.blocksList.getBlockState("a")?.getViewComponent();
    if (!button || !block) throw new Error("the block or its button did not mount");
  }

  /** Logs every listed event that reaches `component`'s own listeners, with the target `getEventTarget` reads. */
  const listen = (component: RunButton | Block | undefined, label: string, types: readonly string[]): void => {
    types.forEach((type) => {
      component?.addEventListener(type, (event: Event) =>
        log.push(`${label}:${type}:${nameOf(getEventTarget(event))}`)
      );
    });
  };

  /** One pointer event at a client point, through GraphLayer as from its root. */
  const send = (type: string, [x, y]: TClientPoint, init: MouseEventInit = {}): MouseEvent => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, ...init });
    graph.getGraphLayer().handleEvent(event);
    return event;
  };

  /** A move there, then a press, a release and the browser's click (click count `detail`). */
  const click = (point: TClientPoint, detail = 1, init: MouseEventInit = {}): void => {
    send("mousemove", point);
    send("mousedown", point, { detail, ...init });
    send("mouseup", point, { detail, ...init });
    send("click", point, { detail, ...init });
  };

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("keeps the hit target through press, release and click on a child and its block", () => {
    mount();
    listen(button, "button", PRESS);
    listen(block, "block", PRESS);
    click(BUTTON);
    // The button stops nothing: each event walks on to the block, whose handlers read the button.
    expect(log).toEqual([
      "button:mousedown:button",
      "block:mousedown:button",
      "button:mouseup:button",
      "block:mouseup:button",
      "button:click:button",
      "block:click:button",
    ]);
    log.length = 0;
    click(BODY);
    expect(log).toEqual(["block:mousedown:block", "block:mouseup:block", "block:click:block"]);
  });

  it("keeps naming the target after the dispatch, for the native press and the emulated click", () => {
    mount();
    const seen: Event[] = [];
    PRESS.forEach((type) => block?.addEventListener(type, (event: Event) => seen.push(event)));
    click(BUTTON);
    expect(seen.map((event) => event.type)).toEqual(["mousedown", "mouseup", "click"]);
    expect(seen.every((event) => getEventTarget(event) === button)).toBe(true);
  });

  it("names the button for a dblclick on it", () => {
    mount();
    listen(button, "button", ["dblclick"]);
    listen(block, "block", ["dblclick"]);
    click(BUTTON, 1);
    click(BUTTON, 2);
    send("dblclick", BUTTON, { detail: 2 });
    expect(log).toEqual(["button:dblclick:button", "block:dblclick:button"]);
  });

  it("names the target GraphLayer found for a touch press and its release", () => {
    mount();
    listen(button, "button", ["touchstart", "touchend"]);
    listen(block, "block", ["touchstart", "touchend"]);
    // GraphLayer reads a press position from `pageX`/`pageY` (`getXY`), which a TouchEvent does not have: give the
    // events the button's position there, so the press is hit on the button.
    const touch = (type: string): TouchEvent => {
      const event = new TouchEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { pageX: { value: BUTTON[0] }, pageY: { value: BUTTON[1] } });
      return event;
    };
    graph.getGraphLayer().handleEvent(touch("touchstart"));
    graph.getGraphLayer().handleEvent(touch("touchend"));
    expect(log).toEqual([
      "button:touchstart:button",
      "block:touchstart:button",
      "button:touchend:button",
      "block:touchend:button",
    ]);
  });

  it("names the hover events' detail.target, on their target and up the parent walk", () => {
    mount();
    const differing: string[] = [];
    const watch = (component: RunButton | Block | undefined, label: string): void => {
      HOVER.forEach((type) => {
        component?.addEventListener(type, (event: Event) => {
          const target = getEventTarget(event);
          log.push(`${label}:${type}:${nameOf(target)}`);
          const detail = (event as CustomEvent<TGraphHoverDetail>).detail;
          if (target !== detail.target) differing.push(`${label}:${type}`);
        });
      });
    };
    watch(button, "button");
    watch(block, "block");
    send("mousemove", EMPTY);
    send("mousemove", BODY);
    send("mousemove", BUTTON);
    send("mousemove", BODY);
    send("mousemove", EMPTY);
    expect(log).toEqual([
      "block:mouseenter:block",
      "block:mouseover:block",
      "block:mouseleave:block",
      "block:mouseout:block",
      "button:mouseenter:button",
      "block:mouseenter:button",
      "button:mouseover:button",
      "block:mouseover:button",
      "button:mouseleave:button",
      "block:mouseleave:button",
      "button:mouseout:button",
      "block:mouseout:button",
      "block:mouseenter:block",
      "block:mouseover:block",
      "block:mouseleave:block",
      "block:mouseout:block",
    ]);
    expect(differing).toEqual([]);
  });

  it("keeps each event's target when a handler dispatches another event in the middle of the walk", () => {
    mount();
    listen(block, "block", ["mousedown"]);
    let nested = false;
    // The button's handler presses on the block's body, once, before the first press walks on to the block.
    button?.addEventListener("mousedown", () => {
      if (nested) return;
      nested = true;
      send("mousedown", BODY);
    });
    send("mousemove", BUTTON);
    send("mousedown", BUTTON);
    // The nested press first (on the body), then the first press reaches the block, still with the button.
    expect(log).toEqual(["block:mousedown:block", "block:mousedown:button"]);
  });

  it("names nothing for events GraphLayer did not dispatch, and for the camera", () => {
    mount();
    listen(block, "block", ["click", "mousedown"]);
    // A click dispatched at the button directly, not through GraphLayer: no recorded target.
    button?.dispatchEvent(new MouseEvent("click"));
    expect(log).toEqual(["block:click:none"]);
    expect(getEventTarget(new MouseEvent("click"))).toBeUndefined();
    expect(getEventTarget(new KeyboardEvent("keydown"))).toBeUndefined();
    expect(getEventTarget(new Event("graph-component-change"))).toBeUndefined();
    // Only a hover event's detail is read: a click shaped like one is not.
    expect(getEventTarget(new CustomEvent("click", { detail: { target: button } }))).toBeUndefined();
    // A hover event built outside GraphLayer (a test or a GPU check dispatches one) is read from its detail.
    expect(getEventTarget(new CustomEvent("mouseenter", { detail: { target: button } })) === button).toBe(true);
    // A press on empty space goes to the camera, which is not a scene component.
    const camera = graph.getGraphLayer().$.camera;
    const sourceTargets: string[] = [];
    graph.on("mousedown", (event) => sourceTargets.push(nameOf(getEventTarget(event.detail.sourceEvent))));
    send("mousemove", EMPTY);
    send("mousedown", EMPTY);
    expect(sourceTargets).toEqual(["none"]);
    expect(getEventTarget(new CustomEvent("mouseenter", { detail: { target: camera } }))).toBeUndefined();
  });

  it("narrows to a class: the target when it is one, else undefined", () => {
    mount();
    const targets: Array<RunButton | undefined> = [];
    const blocks: Array<Block | undefined> = [];
    block?.addEventListener("mouseup", (event: Event) => {
      targets.push(getEventTarget(event, RunButton));
      blocks.push(getEventTarget(event, Block));
    });
    click(BUTTON);
    click(BODY);
    expect(targets.map(nameOf)).toEqual(["button", "none"]);
    expect(blocks.map(nameOf)).toEqual(["none", "block"]);
  });

  it("names the press's target on the bus also when the camera takes the press, which reaches no component", () => {
    mount(true);
    listen(button, "button", PRESS);
    listen(block, "block", PRESS);
    graph.on("mousedown", (event) => log.push(`bus:mousedown:${nameOf(getEventTarget(event.detail.sourceEvent))}`));
    click(BUTTON);
    // The button is not draggable: the camera's pan takes the press (characterization); the release and the click
    // still reach the components.
    expect(log).toEqual([
      "bus:mousedown:button",
      "button:mouseup:button",
      "block:mouseup:button",
      "button:click:button",
      "block:click:button",
    ]);
  });

  describe("the events stay native (characterization, apart from the bus's source event target)", () => {
    it("gives the block's handler the native press, and the bus the same one as its source event", () => {
      mount();
      const pressed: Event[] = [];
      block?.addEventListener("mousedown", (event: Event) => pressed.push(event));
      const sources: Event[] = [];
      const busTargets: boolean[] = [];
      graph.on("mousedown", (event) => {
        sources.push(event.detail.sourceEvent);
        busTargets.push(getEventTarget(event.detail.sourceEvent) === event.detail.target);
      });
      send("mousemove", BUTTON);
      const native = send("mousedown", BUTTON, { ctrlKey: true, detail: 1 });
      expect(pressed.length).toBe(1);
      expect(pressed[0] === native).toBe(true);
      expect(sources.length).toBe(1);
      expect(sources[0] === native).toBe(true);
      expect(sources[0] instanceof MouseEvent).toBe(true);
      expect([native.ctrlKey, native.detail, native.clientX, native.clientY]).toEqual([true, 1, ...BUTTON]);
      // The bus names the target in its detail; the helper reads the same from its source event.
      expect(busTargets).toEqual([true]);
    });

    it("gives the block's handler the emulated click as a native MouseEvent with the press's fields", () => {
      mount();
      const clicks: MouseEvent[] = [];
      block?.addEventListener("click", (event: MouseEvent) => clicks.push(event));
      click(BUTTON, 1, { metaKey: true });
      expect(clicks.length).toBe(1);
      const [emulated] = clicks;
      expect(emulated instanceof MouseEvent).toBe(true);
      expect([emulated.metaKey, emulated.detail, emulated.clientX, emulated.target]).toEqual([
        true,
        1,
        BUTTON[0],
        null,
      ]);
      expect(getEventTarget(emulated) === button).toBe(true);
    });
  });
});
