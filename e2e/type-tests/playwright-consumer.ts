import type { Locator } from "@playwright/test";
import { GraphPO, type GraphPoint } from "@gravity-ui/graph/playwright";

export function createGraphPageObject(root: Locator): GraphPO {
  const point: GraphPoint = { x: 0, y: 0 };
  void point;

  return new GraphPO(root);
}
