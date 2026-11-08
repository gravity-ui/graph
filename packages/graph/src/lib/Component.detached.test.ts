import { Component } from "./Component";
import { CoreComponent } from "./CoreComponent";
import type { DetachedUpdates } from "./DetachedUpdates";
import { Tree } from "./Tree";
import type { TTileRect } from "./culling/TileIndex";

type TLog = string[];
type TItemProps = { log: TLog; name: string; value?: number };
type TItemState = { value: number };
type TInternals = { __comp: { treeNode: Tree; context: { detachedUpdates: DetachedUpdates } } };

const internals = (component: CoreComponent): TInternals["__comp"] => (component as unknown as TInternals).__comp;

const viewport: TTileRect = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

/** A detached leaf that logs the hooks it receives. */
class Item extends Component<TItemProps, TItemState> {
  public static override readonly detached = true;

  public applied = 0;

  constructor(props: TItemProps, parent: CoreComponent) {
    super(props, parent);
    this.state = { value: 0 };
  }

  public change(value: number): void {
    this.setState({ value });
  }

  public place(x: number): void {
    this.setCullingBounds(x, x, x + 10, x + 10);
  }

  public cullingViewport(): TTileRect | undefined {
    return this.getCullingViewport();
  }

  protected override willMount(): void {
    this.props.log.push(`${this.props.name}:mount`);
  }

  protected override willIterate(): void {
    super.willIterate();
    this.applied++;
  }

  protected override propsChanged(next: TItemProps): void {
    this.props.log.push(`${this.props.name}:props:${next.value ?? 0}`);
  }

  protected override stateChanged(next: TItemState): void {
    this.props.log.push(`${this.props.name}:state:${next.value}`);
  }
}

/** Asks for one more step during its own update until the value reaches 3. */
class Echo extends Item {
  protected override willIterate(): void {
    super.willIterate();
    if (this.state.value > 0 && this.state.value < 3) this.change(this.state.value + 1);
  }
}

/** A detached item with one detached child. */
class Group extends Item {
  protected override updateChildren() {
    return [Item.create({ log: this.props.log, name: `${this.props.name}.1` }, { key: "1" })];
  }
}

/** A detached item that passes its value prop to its detached child. */
class Relay extends Item {
  protected override propsChanged(next: TItemProps): void {
    super.propsChanged(next);
    this.shouldUpdateChildren = true;
  }

  protected override updateChildren() {
    const { log, name, value } = this.props;
    return [Item.create({ log, name: `${name}.1`, value }, { key: "1", ref: "child" })];
  }
}

/** Re-requests itself during its own update, then makes its detached parent drop it in the same flush. */
class Leaf extends Item {
  protected override willIterate(): void {
    super.willIterate();
    if (this.state.value !== 1) return;
    this.change(2);
    const parent = this.getParent();
    if (parent instanceof Item) parent.setProps({ value: 1 });
  }
}

/** A detached item that drops its Leaf when its value prop becomes 1. */
class Branch extends Item {
  protected override propsChanged(next: TItemProps): void {
    super.propsChanged(next);
    this.shouldUpdateChildren = true;
  }

  protected override updateChildren() {
    if (this.props.value === 1) return [];
    return [Leaf.create({ log: this.props.log, name: "x" }, { key: "x", ref: "x" })];
  }
}

class Plain extends Component {}

/** A detached item with an attached child, which is an error. */
class BadGroup extends Item {
  protected override updateChildren() {
    return [Plain.create({})];
  }
}

type TOwnerProps = { log: TLog; names: string[]; walkChildren?: boolean; Child?: typeof Item; value?: number };

class Owner extends Component<TOwnerProps> {
  public item(name: string): Item {
    const item = this.$[name];
    if (!(item instanceof Item)) throw new Error(`Expected item ${name}`);
    return item;
  }

  protected override willIterate(): void {
    super.willIterate();
    this.props.log.push("owner:prepare");
    this.shouldRenderChildren = this.props.walkChildren ?? true;
  }

  protected override propsChanged(): void {
    this.shouldUpdateChildren = true;
  }

  protected override updateChildren() {
    const Child = this.props.Child ?? Item;
    const value = this.props.value;
    return this.props.names.map((name) => Child.create({ log: this.props.log, name, value }, { key: name, ref: name }));
  }

  protected override render(): void {
    this.props.log.push("owner:render");
  }
}

/** An owner that records the viewport answers of its detached items while it paints. */
class Asker extends Owner {
  protected override render(): void {
    super.render();
    for (const name of this.props.names) this.props.log.push(`${name}:${this.item(name).isInViewport()}`);
  }
}

class Late extends Component<{ log: TLog }> {
  protected override willIterate(): void {
    super.willIterate();
    this.props.log.push("late:prepare");
  }

  protected override render(): void {
    this.props.log.push("late:render");
  }
}

type TMountOptions = { culling?: boolean; names?: string[]; Child?: typeof Item; Owner?: typeof Owner };

function createRoot(options: TMountOptions) {
  const log: TLog = [];
  const refs: { owner?: Owner } = {};
  const names = options.names ?? ["a", "b"];
  class Root extends Component {
    constructor() {
      super({});
      if (options.culling ?? true) this.setChildrenCulling({ tileSize: 64, getViewport: () => viewport });
    }

    protected override updateChildren() {
      return [
        (options.Owner ?? Owner).create(
          { log, names, Child: options.Child },
          {
            ref: (owner) => {
              refs.owner = owner;
            },
          }
        ),
        Late.create({ log }),
      ];
    }
  }
  const root = CoreComponent.mount(Root);
  return { root, log, refs };
}

const mounted: CoreComponent[] = [];

function mount(options: TMountOptions = {}) {
  const { root, log, refs } = createRoot(options);
  mounted.push(root);
  CoreComponent.update(root);
  const owner = refs.owner;
  if (!owner) throw new Error("Expected owner");
  return { root, owner, log, frame: (): void => CoreComponent.update(root) };
}

afterEach(() => {
  jest.restoreAllMocks();
  for (const root of mounted.splice(0)) CoreComponent.unmount(root);
});

describe("detached components", () => {
  it("apply after the culled tree's preparation and before painting", () => {
    const { log } = mount();
    expect(log).toEqual(["owner:prepare", "late:prepare", "a:mount", "b:mount", "owner:render", "late:render"]);
  });

  it("apply right after their parent's reconciliation without culling", () => {
    const { log } = mount({ culling: false });
    expect(log).toEqual(["owner:prepare", "a:mount", "b:mount", "owner:render", "late:prepare", "late:render"]);
  });

  it("are not walked and stay out of the layer's culling index and structure", () => {
    const iterate = jest.spyOn(Component.prototype, "iterate");
    const { root, owner, frame } = mount();
    root.performRender();
    frame();
    expect(iterate.mock.contexts.some((context) => context instanceof Item)).toBe(false);
    const scope = internals(root).treeNode.culling;
    expect(scope?.nodes.includes(internals(owner).treeNode)).toBe(true);
    expect(scope?.nodes.includes(internals(owner.item("a")).treeNode)).toBe(false);

    const revision = scope?.structureRevision;
    owner.setProps({ names: ["a", "b", "c"] });
    frame();
    expect(owner.item("c")).toBeInstanceOf(Item);
    expect(scope?.structureRevision).toBe(revision);
  });

  it("apply only the components that changed, once per frame", () => {
    const { owner, log, frame } = mount();
    const a = owner.item("a");
    const b = owner.item("b");
    const bApplied = b.applied;
    log.length = 0;
    a.change(1);
    a.change(2);
    frame();
    expect(log.filter((entry) => /^[ab]:/.test(entry))).toEqual(["a:state:2"]);
    expect(b.applied).toBe(bApplied);
  });

  it("apply a request made during their own update in the next frame", () => {
    const { owner, frame } = mount({ Child: Echo, names: ["a"] });
    const a = owner.item("a");
    a.change(1);
    frame();
    expect(a.state.value).toBe(1);
    frame();
    expect(a.state.value).toBe(2);
    frame();
    expect(a.state.value).toBe(3);
    frame();
    expect(a.state.value).toBe(3);
  });

  it.each([
    [true, ["owner:prepare", "a:props:2", "a:state:1", "owner:render"]],
    [false, ["a:state:1", "owner:prepare", "a:props:2", "owner:render"]],
  ])("apply a reconcile that follows their own change in the same frame (culling: %s)", (culling, expected) => {
    const { owner, log, frame } = mount({ culling, names: ["a"] });
    const a = owner.item("a");
    log.length = 0;
    // Queued before the frame; the owner reconciles it with new props in the same frame.
    a.change(1);
    owner.setProps({ value: 2 });
    frame();
    expect(log.filter((entry) => /^(a|owner):/.test(entry))).toEqual(expected);
    expect(a.props.value).toBe(2);
  });

  it.each([true, false])(
    "apply a reconcile by a detached parent that follows their own change in the same frame (culling: %s)",
    (culling) => {
      const { owner, log, frame } = mount({ culling, Child: Relay, names: ["r"] });
      const relay = owner.item("r");
      const child = relay.$.child;
      if (!(child instanceof Item)) throw new Error("Expected relay child");
      log.length = 0;
      child.change(1);
      relay.setProps({ value: 2 });
      frame();
      expect(log.filter((entry) => entry.startsWith("r.1:"))).toEqual(["r.1:state:1", "r.1:props:2"]);
      expect(child.props.value).toBe(2);
    }
  );

  it("apply their own request again when their parent reconciles them in the same frame without culling", () => {
    const { owner, frame } = mount({ Child: Echo, names: ["a"], culling: false });
    const a = owner.item("a");
    a.change(1);
    frame();
    expect(a.state.value).toBe(1);
    // A reconciliation in the same frame applies the item again, which runs its own request too.
    owner.setProps({ value: 5 });
    frame();
    expect(a.state.value).toBe(3);
  });

  it("drop the queued update of a component that unmounts", () => {
    const { owner, log, frame } = mount();
    owner.item("a").change(5);
    owner.setProps({ names: ["b"] });
    frame();
    expect(log).not.toContain("a:state:5");
    expect(owner.$.a).toBeUndefined();
  });

  it("drop every queued update when the root unmounts", () => {
    const { root, owner } = mount();
    owner.item("b").change(3);
    const queue = internals(root).context.detachedUpdates;
    mounted.splice(mounted.indexOf(root), 1);
    CoreComponent.unmount(root);
    expect(queue.flush()).toBe(false);
  });

  it("keep their reconcile order for hit testing", () => {
    const { owner, frame } = mount({ names: ["a", "b", "c"] });
    expect(["a", "b", "c"].map((name) => owner.item(name).renderOrder)).toEqual([0, 1, 2]);
    owner.setProps({ names: ["c", "a"] });
    frame();
    expect(["c", "a"].map((name) => owner.item(name).renderOrder)).toEqual([0, 1]);
  });

  it("are iterated while their parent walks its children", () => {
    const { owner, frame } = mount();
    const a = owner.item("a");
    expect(a.isIterated()).toBe(true);
    owner.setProps({ walkChildren: false });
    frame();
    expect(a.isIterated()).toBe(false);
    // Updates still apply: a batch owner keeps drawing its detached children while it does not walk them.
    a.change(7);
    frame();
    expect(a.state.value).toBe(7);
  });

  it("mount detached children in the same frame", () => {
    const { log } = mount({ Child: Group, names: ["g"] });
    expect(log).toContain("g:mount");
    expect(log).toContain("g.1:mount");
  });

  it.each([true, false])(
    "never apply an update to a component unmounted in the same flush (culling: %s)",
    (culling) => {
      const { owner, log, frame } = mount({ Child: Branch, names: ["p"], culling });
      const branch = owner.item("p");
      const leaf = branch.$.x;
      if (!(leaf instanceof Leaf)) throw new Error("Expected leaf");
      log.length = 0;
      leaf.change(1);
      frame();
      frame();
      expect(branch.$.x).toBeUndefined();
      expect(log.filter((entry) => entry.startsWith("x:"))).toEqual(["x:state:1"]);
      expect(leaf.state.value).toBe(1);
    }
  );

  it("reject attached children, a detached root and culling", () => {
    const { root } = createRoot({ Child: BadGroup, names: ["g"] });
    try {
      expect(() => CoreComponent.update(root)).toThrow(/must be detached/);
    } finally {
      CoreComponent.unmount(root);
    }
    expect(() => CoreComponent.mount(Item, { log: [], name: "root" })).toThrow(/is detached/);

    class CullingItem extends Item {
      constructor(props: TItemProps, parent: CoreComponent) {
        super(props, parent);
        this.setChildrenCulling({ tileSize: 64, getViewport: () => viewport });
      }
    }
    const culling = createRoot({ Child: CullingItem, names: ["c"] });
    try {
      expect(() => CoreComponent.update(culling.root)).toThrow(/cannot cull/);
    } finally {
      CoreComponent.unmount(culling.root);
    }
  });
});

describe("detached components in the viewport", () => {
  it("are in the viewport when their bounds meet the layer's viewport", () => {
    const { owner } = mount();
    const a = owner.item("a");
    const b = owner.item("b");
    a.place(10);
    b.place(500);
    expect(a.isInViewport()).toBe(true);
    expect(b.isInViewport()).toBe(false);
    expect(a.cullingViewport()).toEqual(viewport);
  });

  it("are out of the viewport while their parent does not walk its children", () => {
    const { owner, frame } = mount();
    const a = owner.item("a");
    a.place(10);
    owner.setProps({ walkChildren: false });
    frame();
    expect(a.isInViewport()).toBe(false);
  });

  it("count as in the viewport without culling", () => {
    const { owner } = mount({ culling: false });
    const a = owner.item("a");
    a.place(500);
    expect(a.isInViewport()).toBe(true);
    expect(a.cullingViewport()).toBeUndefined();
  });

  it("answer from the host's frame decision while it paints", () => {
    const { owner, log, frame } = mount({ Owner: Asker, names: ["a", "b"] });
    owner.item("a").place(10);
    owner.item("b").place(500);
    log.length = 0;
    owner.setProps({ walkChildren: true });
    frame();
    expect(log.filter((entry) => /^[ab]:(true|false)$/.test(entry))).toEqual(["a:true", "b:false"]);

    log.length = 0;
    owner.setProps({ walkChildren: false });
    frame();
    expect(log.filter((entry) => /^[ab]:(true|false)$/.test(entry))).toEqual(["a:false", "b:false"]);
  });

  it("answer from the host's prepared decision while it paints without culling", () => {
    const { owner, log, frame } = mount({ Owner: Asker, names: ["a"], culling: false });
    log.length = 0;
    owner.setProps({ walkChildren: false });
    frame();
    owner.setProps({ walkChildren: true });
    frame();
    expect(log.filter((entry) => /^a:(true|false)$/.test(entry))).toEqual(["a:false", "a:true"]);
  });

  it("check the host's walk once per painted frame", () => {
    const { owner, frame } = mount({ Owner: Asker, names: ["a", "b", "c"] });
    for (const name of ["a", "b", "c"]) owner.item(name).place(10);
    const spy = jest.spyOn(Tree.prototype, "isTraversalAllowed");
    owner.setProps({ walkChildren: true });
    frame();
    const ownerNode = internals(owner).treeNode;
    expect(spy.mock.contexts.filter((context) => context === ownerNode)).toHaveLength(1);
  });
});
