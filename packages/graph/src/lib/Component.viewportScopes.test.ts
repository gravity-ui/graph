import { Component } from "./Component";
import { CoreComponent } from "./CoreComponent";
import type { CoreComponentProps } from "./CoreComponent";
import type { TTileRect } from "./culling/TileIndex";

const rect = (x: number): TTileRect => ({ minX: x, minY: x, maxX: x + 100, maxY: x + 100 });

type TLog = string[];

/** Shows an overlay while painted and releases it when it leaves the viewport. */
class Overlay extends Component<{ log: TLog; name: string }> {
  public overlay = false;
  public releases = 0;

  constructor(props: { log: TLog; name: string }, parent: CoreComponent) {
    super(props, parent);
    this.setCullingBounds(10, 10, 20, 20);
  }

  public override viewportChanged(inViewport: boolean): void {
    this.props.log.push(`${this.props.name}:${inViewport ? "in" : "out"}`);
    if (!inViewport && this.overlay) {
      this.overlay = false;
      this.releases++;
    }
  }

  protected willIterate(): void {
    super.willIterate();
    this.props.log.push(`${this.props.name}:prepare`);
  }

  protected render(): void {
    this.props.log.push(`${this.props.name}:render`);
    this.overlay = true;
  }
}

describe("viewportChanged when an ancestor suppresses its branch", () => {
  function setup() {
    const log: TLog = [];
    const state = { allowed: true };
    const refs: { overlay?: Overlay; gate?: Component } = {};
    class Inner extends Component {
      protected updateChildren() {
        return [
          Overlay.create(
            { log, name: "overlay" },
            {
              ref: (overlay) => {
                refs.overlay = overlay;
              },
            }
          ),
        ];
      }
    }
    class Gate extends Component {
      constructor(props: CoreComponentProps, parent: CoreComponent) {
        super(props, parent);
        refs.gate = this;
      }
      protected willIterate(): void {
        super.willIterate();
        this.shouldRenderChildren = state.allowed;
      }
      protected updateChildren() {
        return [Inner.create({})];
      }
    }
    class After extends Component {
      protected render(): void {
        log.push("after:render");
      }
    }
    class Root extends Component {
      constructor() {
        super({});
        this.setChildrenCulling({ tileSize: 64, getViewport: () => rect(0) });
      }
      protected updateChildren() {
        return [Gate.create({}), After.create({})];
      }
    }
    const root = CoreComponent.mount(Root);
    CoreComponent.update(root);
    const { overlay, gate } = refs;
    if (!overlay || !gate) throw new Error("Missing mounted components");
    const toggle = (allowed: boolean): void => {
      state.allowed = allowed;
      gate.performRender();
      CoreComponent.update(root);
    };
    const frame = (): void => {
      root.performRender();
      CoreComponent.update(root);
    };
    return { root, overlay, log, state, toggle, frame };
  }

  it("delivers leaving once and entering once, without walking the suppressed subtree", () => {
    const { root, overlay, log, toggle, frame } = setup();
    expect(log).toEqual(["overlay:prepare", "overlay:in", "overlay:render", "after:render"]);

    log.length = 0;
    toggle(false);
    expect(log).toEqual(["overlay:out", "after:render"]);
    expect(overlay.isInViewport()).toBe(false);
    expect(overlay.overlay).toBe(false);
    expect(overlay.releases).toBe(1);

    // Later suppressed frames neither notify again nor prepare or paint the subtree.
    log.length = 0;
    frame();
    frame();
    expect(log).toEqual(["after:render", "after:render"]);

    log.length = 0;
    toggle(true);
    expect(log.filter((entry) => entry.startsWith("overlay:") && entry !== "overlay:prepare")).toEqual([
      "overlay:in",
      "overlay:render",
    ]);
    // The paint order is kept: the overlay still paints before its later sibling.
    expect(log.indexOf("overlay:render")).toBeLessThan(log.indexOf("after:render"));
    expect(overlay.overlay).toBe(true);
    expect(overlay.releases).toBe(1);
    CoreComponent.unmount(root);
  });
});

describe("viewportChanged when the culling rectangle is replaced", () => {
  function setup() {
    const log: TLog = [];
    const refs: { overlay?: Overlay } = {};
    class Root extends Component {
      constructor() {
        super({});
        this.useRect(0);
      }
      public useRect(x: number): void {
        this.setChildrenCulling({ tileSize: 64, getViewport: () => rect(x) });
        this.performRender();
      }
      public useNoCulling(): void {
        this.setChildrenCulling(undefined);
        this.performRender();
      }
      protected updateChildren() {
        return [
          Overlay.create(
            { log, name: "overlay" },
            {
              ref: (overlay) => {
                refs.overlay = overlay;
              },
            }
          ),
        ];
      }
    }
    const root = CoreComponent.mount(Root);
    CoreComponent.update(root);
    if (!refs.overlay) throw new Error("Missing overlay");
    const notifications = () => log.filter((entry) => entry.endsWith(":in") || entry.endsWith(":out"));
    return { root, overlay: refs.overlay, notifications };
  }

  it("keeps the delivered state of a live component: in, out, in", () => {
    const { root, overlay, notifications } = setup();
    root.useRect(500);
    CoreComponent.update(root);
    expect(overlay.isInViewport()).toBe(false);
    expect(overlay.overlay).toBe(false);
    root.useRect(0);
    CoreComponent.update(root);
    expect(notifications()).toEqual(["overlay:in", "overlay:out", "overlay:in"]);
    expect(overlay.overlay).toBe(true);
    CoreComponent.unmount(root);
  });

  it("tells a component that left the viewport it is back when culling is turned off", () => {
    const { root, overlay, notifications } = setup();
    root.useRect(500);
    CoreComponent.update(root);
    root.useNoCulling();
    CoreComponent.update(root);
    expect(notifications()).toEqual(["overlay:in", "overlay:out", "overlay:in"]);
    expect(overlay.overlay).toBe(true);
    CoreComponent.unmount(root);
  });

  it("does not notify when the new rectangle keeps the component visible", () => {
    const { root, notifications } = setup();
    root.useRect(5);
    CoreComponent.update(root);
    expect(notifications()).toEqual(["overlay:in"]);
    CoreComponent.unmount(root);
  });

  it("does not report leaving on unmount", () => {
    const { root, notifications } = setup();
    CoreComponent.unmount(root);
    expect(notifications()).toEqual(["overlay:in"]);
  });
});
