import { Component } from "./Component";
import { CoreComponent } from "./CoreComponent";
import type { CoreComponentProps } from "./CoreComponent";
import type { TTileRect } from "./TileIndex";
import { ITree, Tree } from "./Tree";

type TProbe = ITree & { name: string };

const rect = (minX: number, minY: number, maxX: number, maxY: number): TTileRect => ({ minX, minY, maxX, maxY });

function setup() {
  const state = { outer: rect(0, 0, 100, 100), inner: rect(0, 0, 100, 100) };
  const painted: string[] = [];
  const prepared: string[] = [];
  const make = (name: string, x?: number): Tree<TProbe> => {
    const node: Tree<TProbe> = new Tree<TProbe>({
      name,
      prepareUpdate: () => {
        prepared.push(name);
        return true;
      },
      iterate: (isPrepared, visible) => {
        if (!isPrepared) node.data.prepareUpdate?.();
        if (visible) painted.push(name);
        return true;
      },
    });
    if (x !== undefined) node.setBounds(x, x, x + 10, x + 10);
    return node;
  };
  const root = make("root");
  root.setCulling({ tileSize: 64, getViewport: () => state.outer });
  const before = make("before", 10);
  const inner = make("inner", 20);
  const leaf = make("leaf", 30);
  const after = make("after", 40);
  root.append(before);
  root.append(inner);
  inner.setCulling({ tileSize: 64, getViewport: () => state.inner });
  inner.append(leaf);
  root.append(after);
  const walk = () => {
    painted.length = prepared.length = 0;
    root.traverseDown((node, isPrepared, visible) => node.data.iterate(isPrepared, visible));
    return { painted: painted.slice(), prepared: prepared.slice() };
  };
  return { state, root, inner, leaf, after, make, walk };
}

describe("nested culling scopes", () => {
  it("walks a nested scope in place, in paint order", () => {
    const { walk } = setup();
    expect(walk().painted).toEqual(["root", "before", "inner", "leaf", "after"]);
    expect(walk().painted).toEqual(["root", "before", "inner", "leaf", "after"]);
  });

  it("prepares requested nodes of a nested scope", () => {
    const { leaf, walk } = setup();
    walk();
    leaf.requestWalk();
    const result = walk();
    expect(result.prepared).toContain("leaf");
    expect(result.painted).toContain("leaf");
  });

  it("culls a nested scope by its own viewport", () => {
    const { state, walk } = setup();
    state.inner = rect(500, 500, 600, 600);
    // The nested owner and its leaf are outside the inner viewport; the outer scope still paints its nodes.
    expect(walk().painted).toEqual(["root", "before", "after"]);
    state.inner = rect(0, 0, 100, 100);
    expect(walk().painted).toEqual(["root", "before", "inner", "leaf", "after"]);
  });

  it("drops a removed nested scope from the outer paint order and restores it when appended again", () => {
    const { root, inner, walk } = setup();
    walk();
    root.remove(inner);
    expect(walk().painted).toEqual(["root", "before", "after"]);
    expect(root.culling?.["paintOrder"]?.nodes.includes(inner)).toBe(false);
    // Appended again, it is the last child.
    root.append(inner);
    expect(walk().painted).toEqual(["root", "before", "after", "inner", "leaf"]);
  });

  it("lets a component inside a culled tree cull its own children", () => {
    const painted: string[] = [];
    class Leaf extends Component<{ name: string }> {
      protected render(): void {
        painted.push(this.props.name);
      }
    }
    class Inner extends Component {
      constructor(props: CoreComponentProps, parent: CoreComponent) {
        super(props, parent);
        this.setChildrenCulling({ tileSize: 64, getViewport: () => undefined });
      }
      protected updateChildren() {
        return [Leaf.create({ name: "leaf" })];
      }
      protected render(): void {
        painted.push("inner");
      }
    }
    class Root extends Component {
      constructor() {
        super({});
        this.setChildrenCulling({ tileSize: 64, getViewport: () => undefined });
      }
      protected updateChildren() {
        return [Inner.create({})];
      }
    }
    const root = CoreComponent.mount(Root);
    CoreComponent.update(root);
    expect(painted).toEqual(["inner", "leaf"]);
    CoreComponent.unmount(root);
  });
});
