import { Component } from "./Component";
import { CoreComponent } from "./CoreComponent";
import type { TTileRect } from "./culling/TileIndex";

const rect = (x: number): TTileRect => ({ minX: x, minY: 0, maxX: x + 100, maxY: 100 });

/** Shows an HTML-like overlay while painted and hides it when it leaves the viewport. */
class Overlayed extends Component<{ x: number }, { value: number }> {
  public events: string[] = [];
  public overlay = false;
  public releases = 0;
  public onLeave?: () => void;

  constructor(props: { x: number }, parent: CoreComponent) {
    super(props, parent);
    this.state = { value: 0 };
    this.setCullingBounds(props.x, 10, props.x + 10, 20);
  }

  public change(value: number): void {
    this.setState({ value });
  }

  public override viewportChanged(inViewport: boolean): void {
    this.events.push(inViewport ? "in" : "out");
    if (!inViewport && this.overlay) {
      this.overlay = false;
      this.releases++;
      this.onLeave?.();
    }
  }

  protected render(): void {
    this.events.push(`render:${this.state.value}`);
    this.overlay = true;
  }
}

function setup(x = 10) {
  const state = { viewport: rect(0), mounted: true };
  let item: Overlayed | undefined;
  class Root extends Component {
    constructor() {
      super({});
      this.setChildrenCulling({ tileSize: 64, getViewport: () => state.viewport });
    }
    protected updateChildren() {
      if (!state.mounted) return [];
      return [
        Overlayed.create(
          { x },
          {
            ref: (child) => {
              item = child;
            },
          }
        ),
      ];
    }
    public refresh(): void {
      this.shouldUpdateChildren = true;
      this.performRender();
    }
  }
  const root = CoreComponent.mount(Root);
  CoreComponent.update(root);
  if (!item) throw new Error("Missing mounted item");
  const pan = (to: number): void => {
    state.viewport = rect(to);
    root.performRender();
    CoreComponent.update(root);
  };
  return { root, item, state, pan };
}

describe("viewportChanged", () => {
  it("tells a clean component once when it leaves and when it returns, before painting", () => {
    const { root, item, pan } = setup();
    expect(item.events).toEqual(["in", "render:0"]);
    expect(item.overlay).toBe(true);

    pan(500);
    expect(item.events).toEqual(["in", "render:0", "out"]);
    expect(item.overlay).toBe(false);
    expect(item.releases).toBe(1);

    // Further offscreen frames do not repeat it.
    pan(900);
    pan(1300);
    expect(item.events).toEqual(["in", "render:0", "out"]);
    expect(item.releases).toBe(1);

    pan(0);
    expect(item.events).toEqual(["in", "render:0", "out", "in", "render:0"]);
    expect(item.overlay).toBe(true);
    CoreComponent.unmount(root);
  });

  it("does not notify a component that is unmounted, then or later", () => {
    const { root, item, state, pan } = setup();
    item.events.length = 0;
    state.mounted = false;
    (root as unknown as { refresh(): void }).refresh();
    CoreComponent.update(root);
    pan(500);
    pan(0);
    expect(item.events).toEqual([]);
    CoreComponent.unmount(root);
  });

  it("applies an update requested from the handler in the next scheduled frame", () => {
    const { root, item, pan } = setup();
    item.onLeave = () => item.change(5);
    pan(500);
    expect(item.events.slice(-1)).toEqual(["out"]);
    CoreComponent.update(root);
    expect(item.state.value).toBe(5);
    pan(0);
    expect(item.events.slice(-2)).toEqual(["in", "render:5"]);
    CoreComponent.unmount(root);
  });

  it("does not track components that do not define the hook", () => {
    class Plain extends Component {}
    expect(typeof new Plain({}).viewportChanged).toBe("undefined");
  });
});
