import { expect, test } from "@playwright/test";

import { GraphPageObject } from "../page-objects/GraphPageObject";

const BLOCKS = [
  {
    id: "block-a",
    is: "Block" as const,
    x: 100,
    y: 100,
    width: 180,
    height: 90,
    name: "Block A",
    anchors: [],
    selected: false,
  },
  {
    id: "block-b",
    is: "Block" as const,
    x: 380,
    y: 100,
    width: 180,
    height: 90,
    name: "Block B",
    anchors: [],
    selected: false,
  },
  {
    id: "block-c",
    is: "Block" as const,
    x: 660,
    y: 100,
    width: 180,
    height: 90,
    name: "Block C",
    anchors: [],
    selected: false,
  },
];

const CONNECTIONS = [
  {
    id: "connection-a-b",
    sourceBlockId: "block-a",
    targetBlockId: "block-b",
  },
  {
    id: "connection-b-c",
    sourceBlockId: "block-b",
    targetBlockId: "block-c",
  },
];

async function getRelatedBlocksByDepth(
  graphPO: GraphPageObject,
  sourceBlockId: string,
  depth: number,
): Promise<Array<string | number>> {
  return graphPO.page.evaluate(
    ({ sourceId, depthLevel }) => {
      const { GraphComponent } = window.GraphModule;
      const graphComponents = window.graph.getElementsOverRect(
        {
          x: -100000,
          y: -100000,
          width: 200000,
          height: 200000,
        },
        [GraphComponent],
      ) as Array<{
        getEntityType(): string;
        getEntityId(): string | number;
      }>;

      const source = graphComponents.find((component) => {
        return component.getEntityType() === "block" && component.getEntityId() === sourceId;
      });

      if (!source) {
        throw new Error(`Source block component not found: ${sourceId}`);
      }

      const related = window.graph.getRelatedEntitiesByPorts(source, { depth: depthLevel }) as Record<
        string,
        Array<string | number>
      >;

      return (related.block ?? []).slice().sort();
    },
    { sourceId: sourceBlockId, depthLevel: depth },
  );
}

async function getRelatedByDepth(
  graphPO: GraphPageObject,
  sourceBlockId: string,
  depth: number,
): Promise<Record<string, Array<string | number>>> {
  return graphPO.page.evaluate(
    ({ sourceId, depthLevel }) => {
      const { GraphComponent } = window.GraphModule;
      const graphComponents = window.graph.getElementsOverRect(
        {
          x: -100000,
          y: -100000,
          width: 200000,
          height: 200000,
        },
        [GraphComponent],
      ) as Array<{
        getEntityType(): string;
        getEntityId(): string | number;
      }>;

      const source = graphComponents.find((component) => {
        return component.getEntityType() === "block" && component.getEntityId() === sourceId;
      });

      if (!source) {
        throw new Error(`Source block component not found: ${sourceId}`);
      }

      return window.graph.getRelatedEntitiesByPorts(source, { depth: depthLevel }) as Record<
        string,
        Array<string | number>
      >;
    },
    { sourceId: sourceBlockId, depthLevel: depth },
  );
}

test.describe("Related entities by ports", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: BLOCKS,
      connections: CONNECTIONS,
    });

    await graphPO.waitForFrames(5);
  });

  test("depth=1 returns only directly connected blocks", async () => {
    const related = await getRelatedBlocksByDepth(graphPO, "block-a", 1);

    expect(related).toEqual(["block-b"]);
  });

  test("depth=2 traverses through connection to next block", async () => {
    const related = await getRelatedBlocksByDepth(graphPO, "block-a", 2);

    expect(related).toEqual(["block-b", "block-c"]);
  });

  test("connections are included but do not increment depth", async () => {
    const depth1 = await getRelatedByDepth(graphPO, "block-a", 1);
    const depth2 = await getRelatedByDepth(graphPO, "block-a", 2);

    expect(depth1.block?.slice().sort()).toEqual(["block-b"]);
    expect(depth1.connection?.slice().sort()).toEqual(["connection-a-b"]);

    expect(depth2.block?.slice().sort()).toEqual(["block-b", "block-c"]);
    expect(depth2.connection?.slice().sort()).toEqual(["connection-a-b", "connection-b-c"]);
  });
});
