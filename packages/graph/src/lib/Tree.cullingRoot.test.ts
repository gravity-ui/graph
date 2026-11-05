import { ITree, Tree } from "./Tree";

const node = (): Tree => new Tree<ITree>({ iterate: () => true });
const options = { tileSize: 64, getViewport: () => undefined };

describe("culling roots", () => {
  it("configures culling only on a root", () => {
    const parent = node();
    const child = node();
    parent.append(child);
    expect(() => child.setCulling(options)).toThrow("Only a tree root can cull its descendants");
    expect(() => parent.setCulling(options)).not.toThrow();
  });

  it("does not append a root that culls its descendants", () => {
    const root = node();
    const culled = node();
    culled.setCulling(options);
    expect(() => root.append(culled)).toThrow("A tree root that culls its descendants cannot become a child");
    expect(culled.parent).toBeUndefined();
  });

  it("puts every descendant in the root's scope", () => {
    const root = node();
    const child = node();
    const leaf = node();
    root.setCulling(options);
    root.append(child);
    child.append(leaf);
    expect(child.scope).toBe(root.culling);
    expect(leaf.scope).toBe(root.culling);
  });
});
