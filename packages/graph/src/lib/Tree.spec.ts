import { jest } from "@jest/globals";

import { ITree, Tree } from "./Tree";

describe("Tree", () => {
  const createChildData = () =>
    ({
      iterate: jest.fn(),
    }) as ITree;
  test("Creation of a Tree object", () => {
    const tree = new Tree(createChildData());
    expect(tree).toBeInstanceOf(Tree);
  });

  test("Adding and removing child elements", () => {
    const parent = new Tree(createChildData());
    const child1 = new Tree(createChildData());
    const child2 = new Tree(createChildData());

    parent.append(child1);
    parent.append(child2);

    expect(parent.children.has(child1)).toBe(true);
    expect(parent.children.has(child2)).toBe(true);

    parent.remove(child1);
    parent.remove(child2);

    expect(parent.children.size).toBe(0);
  });

  test("Changing the rendering order", () => {
    const parent = new Tree(createChildData());
    const child1 = new Tree(createChildData());
    const child2 = new Tree(createChildData());

    parent.append(child1);
    parent.append(child2);

    child1.renderOrder = 1;
    child2.renderOrder = 2;

    expect(child1.renderOrder).toBe(1);
    expect(child2.renderOrder).toBe(2);
  });

  test("Changing the z-index", () => {
    const parent = new Tree(createChildData());
    const child1 = new Tree(createChildData());
    const child2 = new Tree(createChildData());

    parent.append(child1);
    parent.append(child2);

    child1.zIndex = 1;
    child2.zIndex = 2;

    expect(child1.zIndex).toBe(1);
    expect(child2.zIndex).toBe(2);
  });

  test("Traversing the tree", () => {
    const root = new Tree(createChildData());
    const child1 = new Tree(createChildData());
    const child2 = new Tree(createChildData());

    root.append(child1);
    root.append(child2);

    let count = 0;

    root.traverseDown((node) => {
      count++;
      expect(node).toBeInstanceOf(Tree);
      return true;
    });

    expect(count).toBe(3); // Including the root
  });
});
