import type { Locator } from "@playwright/test";
import type { Graph, TBlock, TConnection } from "@gravity-ui/graph";
import { GraphPO, type GraphPoint } from "@gravity-ui/graph/playwright";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Condition extends true> = Condition;
type IsAny<Value> = 0 extends 1 & Value ? true : false;

type EvaluateGraph = Parameters<Parameters<GraphPO["evaluate"]>[0]>[0];
type BlockState = Awaited<ReturnType<ReturnType<GraphPO["block"]>["getState"]>>;
type ConnectionState = Awaited<ReturnType<ReturnType<GraphPO["connection"]>["getState"]>>;

type _EvaluateGraphIsNotAny = Assert<Equal<IsAny<EvaluateGraph>, false>>;
type _EvaluateReceivesGraph = Assert<Equal<EvaluateGraph, Graph>>;
type _BlockStateIsNotAny = Assert<Equal<IsAny<BlockState>, false>>;
type _BlockStateIsPublicTBlock = Assert<Equal<BlockState, TBlock | null>>;
type _ConnectionStateIsNotAny = Assert<Equal<IsAny<ConnectionState>, false>>;
type _ConnectionStateIsPublicTConnection = Assert<Equal<ConnectionState, TConnection | null>>;

export async function checkPlaywrightConsumerTypes(root: Locator): Promise<void> {
  const graph = new GraphPO(root);
  const point: GraphPoint = { x: 0, y: 0 };

  const graphState: Promise<number> = graph.evaluate((instance: Graph) => instance.state);
  const blockState: Promise<TBlock | null> = graph.block("block-1").getState();
  const connectionState: Promise<TConnection | null> = graph.connection("connection-1").getState();

  await Promise.all([graphState, blockState, connectionState]);
  await graph.clickAt(point);
}
