import type { LayeredLayoutOptions } from "./types";

type ID = string & { __brand: "NodeId" };

export type Edge<NodeId> = {
  from: NodeId;
  to: NodeId;
  arrows?: { from?: boolean; to?: boolean };
};

export type Node<NodeId> = {
  id: NodeId;
  level: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  shape?: string;
};

type Graph<NodeId = string, T extends Node<NodeId> = Node<NodeId>> = Record<
  string,
  {
    node: T;
    in: ID[];
    out: ID[];
    rank?: number;
    order?: number;
    virtual?: boolean;
  }
>;

/** Used internally by layout steps that don't depend on concrete NodeId/Node type */
type GraphInternal = Graph<string, Node<string>>;

function getGraph<NodeId, T extends Node<NodeId>>(nodes: T[], edges: Edge<NodeId>[]) {
  const graph: Graph<NodeId, T> = {};
  const layering: Set<ID>[] = [];
  const nodeIdToId = new Map<NodeId, ID>();
  let id: ID;
  let count = 0;
  for (const node of nodes) {
    id = `innerNodeId_${count++}` as ID;
    let layer = layering[node.level];
    if (!layer) {
      layering[node.level] = layer = new Set();
    }
    layer.add(id);
    nodeIdToId.set(node.id, id);
    graph[id] = { node: { ...node }, in: [], out: [] };
  }
  for (const edge of edges) {
    const from = nodeIdToId.get(edge.from);
    const to = nodeIdToId.get(edge.to);

    if (from !== undefined && to !== undefined) {
      graph[from].out.push(to);
      graph[to].in.push(from);
    }
  }
  return {
    graph,
    layering: layering.filter(Boolean),
    levels: layering.map((layer, index) => (layer ? index : -1)).filter((i) => i !== -1),
  };
}

function prepareGraph(graph: Graph, layering: Set<ID>[], levels: number[]) {
  let count = 0;
  for (let i = 0; i < layering.length; i++) {
    const layer = layering[i];
    const nextLayer = layering[i + 1];
    for (const nodeId of layer) {
      const nodeGraph = graph[nodeId];
      nodeGraph.rank = i;
      if (i === layering.length - 1) {
        continue;
      }
      for (let index = 0; index < nodeGraph.out.length; index++) {
        const outputNode = nodeGraph.out[index];
        if (!nextLayer.has(outputNode)) {
          const newId = `${outputNode}_${count++}` as ID;
          const newNode = { id: newId, shape: "dot", size: 0, level: levels[i] };
          graph[newId] = {
            node: newNode as Node<string>,
            in: [nodeId],
            out: [],
            virtual: true,
          };
          nextLayer.add(newId);
          nodeGraph.out[index] = newId;
          graph[newId].out.push(outputNode);
          graph[outputNode].in[graph[outputNode].in.indexOf(nodeId)] = newId;
        }
      }
    }
  }
}

function initOrder(graph: Graph, layering: Set<ID>[]) {
  const queue = [...layering[0]];
  const order: ID[][] = [];
  const visited = new Set(queue);
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (nodeId === undefined) {
      break;
    }
    const graphNode = graph[nodeId];
    let layer = order[graphNode.rank!];
    if (!layer) {
      order[graphNode.rank!] = layer = [];
    }
    layer.push(nodeId);
    for (const outNodeId of graphNode.out) {
      if (visited.has(outNodeId)) {
        continue;
      }
      visited.add(outNodeId);
      queue.push(outNodeId);
    }
  }
  return order;
}

function twoLayerCrossCount(graph: Graph, northLayer: ID[], southLayer: ID[]) {
  const southPos = southLayer.reduce(
    (obj, nodeId, i) => {
      obj[nodeId] = i;
      return obj;
    },
    {} as Record<string, number>
  );
  const southEntries: number[] = [];
  for (const v of northLayer) {
    southEntries.push(...graph[v].out.map((e) => southPos[e]).sort((a, b) => a - b));
  }

  let firstIndex = 1;
  while (firstIndex < southLayer.length) {
    firstIndex *= 2;
  }
  const treeSize = 2 * firstIndex - 1;
  firstIndex -= 1;
  const tree: number[] = new Array(treeSize).fill(0);

  let cc = 0;
  southEntries.forEach((pos) => {
    let index = pos + firstIndex;
    tree[index]++;
    while (index > 0) {
      if (index % 2) {
        cc += tree[index + 1];
      }
      index = Math.floor((index - 1) / 2);
      tree[index]++;
    }
  });

  return cc;
}

function countCrossing(graph: Graph, order: ID[][]) {
  let cc = 0;
  for (let i = 1; i < order.length; ++i) {
    cc += twoLayerCrossCount(graph, order[i - 1], order[i]);
  }
  return cc;
}

function medianValue(nodes: ID[], order: ID[]) {
  const positions = order.reduce((pos, nodeId, i) => {
    if (nodes.includes(nodeId)) {
      pos.push(i);
    }
    return pos;
  }, [] as number[]);
  if (positions.length === 0) {
    return -1;
  }
  const m = Math.floor(positions.length / 2);
  if (positions.length % 2 === 1) {
    return positions[m];
  }
  if (positions.length === 2) {
    return (positions[0] + positions[1]) / 2;
  }
  const left = positions[m - 1] - positions[0];
  const right = positions[positions.length - 1] - positions[m];
  return (positions[m - 1] * right + positions[m] * left) / (left + right);
}

function sortWithFixedNodes(order: ID[], median: Record<string, number>) {
  const sorted = order.filter((a) => median[a] !== -1).sort((a, b) => median[a] - median[b]);
  for (let i = 0, sortIndex = 0; sortIndex < sorted.length; i++) {
    if (median[order[i]] !== -1) {
      order[i] = sorted[sortIndex++];
    }
  }
}

function applyWeightedMedianHeuristic(graph: Graph, order: ID[][], iter: number) {
  if (iter % 2 === 0) {
    for (let i = 1; i < order.length; i++) {
      const median: Record<string, number> = {};
      for (const nodeId of order[i]) {
        median[nodeId] = medianValue(graph[nodeId].in, order[i - 1]);
      }
      sortWithFixedNodes(order[i], median);
    }
  } else {
    for (let i = order.length - 2; i >= 0; i--) {
      const median: Record<string, number> = {};
      for (const nodeId of order[i]) {
        median[nodeId] = medianValue(graph[nodeId].out, order[i + 1]);
      }
      sortWithFixedNodes(order[i], median);
    }
  }
}

function swap(rank: unknown[], i: number, j: number) {
  const tmp = rank[i];
  rank[i] = rank[j];
  rank[j] = tmp;
}

function partialCountCrossing(graph: Graph, order: ID[][], layerIndex: number) {
  let cc = 0;
  if (layerIndex > 0) {
    cc += twoLayerCrossCount(graph, order[layerIndex - 1], order[layerIndex]);
  }
  if (layerIndex < order.length - 1) {
    cc += twoLayerCrossCount(graph, order[layerIndex], order[layerIndex + 1]);
  }
  return cc;
}

function transpose(graph: Graph, order: ID[][]) {
  let improved = true;
  let count = 0;
  const maxIteration = 10;
  while (improved && count++ < maxIteration) {
    improved = false;
    for (let layerIndex = 0; layerIndex < order.length; layerIndex++) {
      const layer = order[layerIndex];
      let bestCC = partialCountCrossing(graph, order, layerIndex);
      for (let i = 0; i < layer.length - 1; i++) {
        swap(layer, i, i + 1);
        const cc = partialCountCrossing(graph, order, layerIndex);
        if (bestCC > cc) {
          improved = true;
          bestCC = cc;
        } else {
          swap(layer, i, i + 1);
        }
      }
    }
  }
}

function ordering(graph: Graph, layering: Set<ID>[], skipTranspose?: boolean) {
  const maxSweeps = 24;
  const order = initOrder(graph, layering);
  let bestOrder = order.map((el) => [...el]);
  let bestCC = countCrossing(graph, order);
  for (let i = 0, lastBest = 0; lastBest < 4 && i < maxSweeps; i++, lastBest++) {
    applyWeightedMedianHeuristic(graph, order, i);
    if (!skipTranspose) {
      transpose(graph, order);
    }
    const cc = countCrossing(graph, order);
    if (bestCC > cc) {
      bestCC = cc;
      bestOrder = order.map((el) => [...el]);
      lastBest = 0;
    }
  }
  bestOrder.forEach((layer) => {
    layer.forEach((v, i) => {
      graph[v].order = i;
    });
  });
  return bestOrder;
}

function findOtherInnerSegmentNode(graph: Graph, v: ID) {
  if (graph[v].virtual) {
    return graph[v].in.find((u) => graph[u].virtual);
  }
  return undefined;
}

function addConflict(conflicts: Record<string, Set<ID>>, v: ID, w: ID) {
  let conflictsV = conflicts[v];
  if (!conflictsV) {
    conflicts[v] = conflictsV = new Set();
  }
  conflictsV.add(w);
}

function hasConflict(conflicts: Record<string, Set<ID>>, v: ID, w: ID) {
  return (conflicts[v] && conflicts[v].has(w)) || (conflicts[w] && conflicts[w].has(v));
}

function findType1Conflicts(graph: Graph, layering: ID[][]) {
  const conflicts: Record<string, Set<ID>> = {};

  function visitLayer(prevLayer: ID[], layer: ID[]) {
    let k0 = 0;
    let scanPos = 0;
    const prevLayerLength = prevLayer.length;
    const lastNode = layer[layer.length - 1];

    layer.forEach((v, i) => {
      const w = findOtherInnerSegmentNode(graph, v);
      const k1 = w ? graph[w].order! : prevLayerLength;

      if (w || v === lastNode) {
        layer.slice(scanPos, i + 1).forEach((scanNode) => {
          graph[scanNode].in.forEach((u) => {
            const uNode = graph[u];
            const uPos = uNode.order!;
            if ((uPos < k0 || k1 < uPos) && !(uNode.virtual && graph[scanNode].virtual)) {
              addConflict(conflicts, u, scanNode);
            }
          });
        });
        scanPos = i + 1;
        k0 = k1;
      }
    });

    return layer;
  }

  layering.reduce(visitLayer);
  return conflicts;
}

function findType2Conflicts(graph: Graph, layering: ID[][]) {
  const conflicts: Record<string, Set<ID>> = {};

  function scan(south: ID[], southPos: number, southEnd: number, prevNorthBorder: number, nextNorthBorder: number) {
    for (let i = southPos; i < southEnd; i++) {
      const v = south[i];
      if (graph[v].virtual) {
        graph[v].in.forEach((u) => {
          const uNode = graph[u];
          if (uNode.virtual && (uNode.order! < prevNorthBorder || uNode.order! > nextNorthBorder)) {
            addConflict(conflicts, u, v);
          }
        });
      }
    }
  }

  function visitLayer(north: ID[], south: ID[]) {
    let prevNorthPos = -1;
    let nextNorthPos = 0;
    let southPos = 0;

    south.forEach((v, southLookahead) => {
      if (graph[v].virtual) {
        const predecessors = graph[v].in;
        if (predecessors.length) {
          nextNorthPos = graph[predecessors[0]].order!;
          scan(south, southPos, southLookahead, prevNorthPos, nextNorthPos);
          southPos = southLookahead;
          prevNorthPos = nextNorthPos;
        }
      }
      scan(south, southPos, south.length, prevNorthPos, north.length);
    });

    return south;
  }

  layering.reduce(visitLayer);
  return conflicts;
}

function verticalAlignment(graph: Graph, layering: ID[][], conflicts: Record<string, Set<ID>>, neighbor: "in" | "out") {
  const root: Record<string, ID> = {};
  const align: Record<string, ID> = {};
  const pos: Record<string, number> = {};

  layering.forEach((layer) => {
    layer.forEach((v, order) => {
      root[v] = v;
      align[v] = v;
      pos[v] = order;
    });
  });

  layering.forEach((layer) => {
    let prevIdx = -1;
    layer.forEach((v) => {
      const ws = graph[v][neighbor];
      if (ws.length) {
        ws.sort((a, b) => pos[a] - pos[b]);
        const mp = (ws.length - 1) / 2;
        for (let i = Math.floor(mp), il = Math.ceil(mp); i <= il; i++) {
          const w = ws[i];
          if (align[v] === v && prevIdx < pos[w] && !hasConflict(conflicts, v, w)) {
            align[w] = v;
            align[v] = root[v] = root[w];
            prevIdx = pos[w];
          }
        }
      }
    });
  });

  return { root, align };
}

export const DEFAULT_NODE_WIDTH = 100;
export const DEFAULT_NODE_HEIGHT = 100;

type ResolvedLayoutOptions = Required<
  Pick<
    LayeredLayoutOptions,
    | "nodeHorizontalGap"
    | "nodeVerticalGap"
    | "defaultNodeWidth"
    | "defaultNodeHeight"
    | "layerSpacingFactor"
    | "enormousGraphNodeThreshold"
    | "enormousGraphEdgeThreshold"
  >
>;

function resolveLayoutOptions(options?: LayeredLayoutOptions): ResolvedLayoutOptions {
  const defaultNodeWidth = options?.defaultNodeWidth ?? DEFAULT_NODE_WIDTH;
  const defaultNodeHeight = options?.defaultNodeHeight ?? DEFAULT_NODE_HEIGHT;
  return {
    defaultNodeWidth,
    defaultNodeHeight,
    nodeHorizontalGap: options?.nodeHorizontalGap ?? defaultNodeWidth * 2,
    nodeVerticalGap: options?.nodeVerticalGap ?? 200,
    layerSpacingFactor: options?.layerSpacingFactor ?? 1.7,
    enormousGraphNodeThreshold: options?.enormousGraphNodeThreshold ?? 700,
    enormousGraphEdgeThreshold: options?.enormousGraphEdgeThreshold ?? 3000,
  };
}

function nodeWidth(graph: Graph | undefined, v: ID | undefined, opts: ResolvedLayoutOptions): number {
  if (graph && v && graph[v]) {
    const width = graph[v].node.width ?? opts.defaultNodeWidth;
    return width + opts.nodeHorizontalGap;
  }
  return opts.defaultNodeWidth + opts.nodeHorizontalGap;
}

function nodeHeight(graph: Graph | undefined, v: ID | undefined, opts: ResolvedLayoutOptions): number {
  if (graph && v && graph[v]) {
    const height = graph[v].node.height ?? opts.defaultNodeHeight;
    return height + opts.nodeVerticalGap;
  }
  return opts.defaultNodeHeight + opts.nodeVerticalGap;
}

function horizontalCompaction(
  graph: Graph,
  layering: ID[][],
  root: Record<string, ID>,
  align: Record<string, ID>,
  reverse: boolean,
  opts: ResolvedLayoutOptions
): Record<string, number> {
  const xs: Record<string, number> = {};
  const sink = Object.keys(graph).reduce(
    (obj, key) => {
      obj[key] = key;
      return obj;
    },
    {} as Record<string, string>
  );
  const shift = Object.keys(graph).reduce(
    (obj, key) => {
      obj[key] = Number.POSITIVE_INFINITY;
      return obj;
    },
    {} as Record<string, number>
  );
  function placeBlock(v: ID): void {
    if (xs[v] === undefined) {
      xs[v] = 0;
      let w = v;
      do {
        const rank = reverse ? layering.length - graph[w].rank! - 1 : graph[w].rank!;
        const pos = layering[rank].indexOf(w);
        if (pos > 0) {
          const u = root[layering[rank][pos - 1]];
          placeBlock(u);
          if (sink[v] === v) {
            sink[v] = sink[u];
          }
          if (sink[v] === sink[u]) {
            xs[v] = Math.max(xs[v], xs[u] + nodeHeight(graph, v, opts));
          } else {
            shift[sink[u]] = Math.min(shift[sink[u]], xs[v] - xs[u] - nodeHeight(graph, v, opts));
          }
        }
        w = align[w];
      } while (w !== v);
    }
  }
  Object.keys(graph).forEach((v) => {
    if (root[v] === v) {
      placeBlock(v as ID);
    }
  });
  Object.keys(graph).forEach((v) => {
    xs[v] = xs[root[v]];
    if (shift[sink[root[v]]] < Number.POSITIVE_INFINITY) {
      xs[v] = xs[v] + shift[sink[root[v]]];
    }
  });
  return xs;
}

function findSmallestHeightAlignment(
  graph: Graph,
  xss: Record<string, Record<string, number>>,
  opts: ResolvedLayoutOptions
): Record<string, number> {
  return Object.values(xss).reduce(
    (res, xs) => {
      let max = Number.NEGATIVE_INFINITY;
      let min = Number.POSITIVE_INFINITY;

      Object.entries(xs).forEach(([v, x]) => {
        const halfHeight = nodeHeight(graph, v as ID, opts) / 2;
        max = Math.max(x + halfHeight, max);
        min = Math.min(x - halfHeight, min);
      });

      const height = max - min;
      if (res.min > height) {
        return {
          min: height,
          align: xs,
        };
      }
      return res;
    },
    { min: Number.POSITIVE_INFINITY } as { min: number; align: Record<string, number> }
  ).align;
}

function alignCoordinates(xss: Record<string, Record<string, number>>, alignTo: Record<string, number>) {
  const alignToVals = Object.values(alignTo);
  const alignToMin = alignToVals.reduce((a, b) => Math.min(a, b));
  const alignToMax = alignToVals.reduce((a, b) => Math.max(a, b));

  (["u", "d"] as const).forEach((vert) => {
    (["l", "r"] as const).forEach((horiz) => {
      const alignment = vert + horiz;
      const xs = xss[alignment];
      if (xs === alignTo) {
        return;
      }

      const xsVals = Object.values(xs);
      const delta =
        horiz === "l"
          ? alignToMin - xsVals.reduce((a, b) => Math.min(a, b))
          : alignToMax - xsVals.reduce((a, b) => Math.max(a, b));

      if (delta) {
        Object.keys(xs).forEach((key) => {
          xs[key] += delta;
        });
      }
    });
  });
}

function balance(xss: Record<string, Record<string, number>>, align?: string) {
  return Object.keys(xss.ul).reduce(
    (obj, v) => {
      if (align) {
        obj[v] = xss[align.toLowerCase()][v];
      } else {
        const vXs = Object.values(xss)
          .map((xs) => xs[v])
          .sort((a, b) => a - b);
        obj[v] = (vXs[1] + vXs[2]) / 2;
      }
      return obj;
    },
    {} as Record<string, number>
  );
}

function mergeConflicts(a: Record<string, Set<ID>>, b: Record<string, Set<ID>>): Record<string, Set<ID>> {
  const conflicts: Record<string, Set<ID>> = {};
  Object.entries(a).forEach(([v, ws]) => {
    ws.forEach((w) => {
      addConflict(conflicts, v as ID, w);
    });
  });
  Object.entries(b).forEach(([v, ws]) => {
    ws.forEach((w) => {
      addConflict(conflicts, v as ID, w);
    });
  });
  return conflicts;
}

function positionY(graph: Graph, layering: ID[][], opts: ResolvedLayoutOptions): Record<string, number> {
  const conflicts = mergeConflicts(findType1Conflicts(graph, layering), findType2Conflicts(graph, layering));

  const xss: Record<string, Record<string, number>> = {};
  let adjustedLayering: ID[][];
  (["u", "d"] as const).forEach((vert) => {
    adjustedLayering = vert === "u" ? layering : [...layering].reverse();
    (["l", "r"] as const).forEach((horiz) => {
      if (horiz === "r") {
        adjustedLayering = adjustedLayering.map((inner) => {
          return [...inner].reverse();
        });
      }

      const neighborFn = vert === "u" ? "in" : "out";
      const { root, align } = verticalAlignment(graph, adjustedLayering, conflicts, neighborFn);
      const xs = horizontalCompaction(graph, adjustedLayering, root, align, vert === "d", opts);
      if (horiz === "r") {
        Object.keys(xs).forEach((v) => {
          xs[v] = -xs[v];
        });
      }
      xss[vert + horiz] = xs;
    });
  });
  const smallestHeight = findSmallestHeightAlignment(graph, xss, opts);
  alignCoordinates(xss, smallestHeight);
  return balance(xss);
}

function position(graph: Graph, order: ID[][], opts: ResolvedLayoutOptions): void {
  const ys = positionY(graph, order, opts);
  Object.keys(ys).forEach((v) => {
    graph[v].node.y = ys[v];
  });

  const valueY = Object.values(ys);
  const step =
    Math.max(
      nodeWidth(undefined, undefined, opts),
      (valueY.reduce((a, b) => Math.max(a, b)) - valueY.reduce((a, b) => Math.min(a, b))) / order.length
    ) * opts.layerSpacingFactor;
  let x = 0;
  order.forEach((layer) => {
    layer.forEach((nodeId) => {
      const node = graph[nodeId].node;
      node.x = x;
    });
    x += step;
  });
}

function prepareResult<NodeId, T extends Node<NodeId>>(graph: Graph<NodeId, T>) {
  const nodes: T[] = [];
  const edges: Edge<NodeId>[] = [];
  Object.values(graph).forEach((graphNode) => {
    const node = graphNode.node;
    if (graphNode.virtual) {
      if (!graph[graphNode.in[0]].virtual) {
        let to = graphNode.out[0];
        if (graph[to].virtual) {
          while (graph[graph[to].out[0]].virtual) {
            to = graph[to].out[0];
          }
        }
        const startNode = graph[graphNode.in[0]].node;
        const toNode = graph[to].node;
        if (graph[to].virtual) {
          const finalNode = graph[graph[to].out[0]].node;
          if (startNode.y === node.y) {
            if (toNode.y === finalNode.y) {
              edges.push({ from: startNode.id, to: finalNode.id });
            } else {
              nodes.push(toNode);
              edges.push({ from: startNode.id, to: toNode.id, arrows: { to: false } });
              edges.push({ from: toNode.id, to: finalNode.id, arrows: { from: false } });
            }
          } else if (toNode.y === finalNode.y) {
            nodes.push(node);
            edges.push({ from: startNode.id, to: node.id, arrows: { to: false } });
            edges.push({ from: node.id, to: finalNode.id, arrows: { from: false } });
          } else {
            nodes.push(node);
            nodes.push(toNode);
            edges.push({ from: startNode.id, to: node.id, arrows: { to: false } });
            edges.push({
              from: node.id,
              to: toNode.id,
              arrows: { from: false, to: false },
            });
            edges.push({ from: toNode.id, to: finalNode.id, arrows: { from: false } });
          }
        } else if (startNode.y === node.y && node.y === toNode.y) {
          edges.push({ from: startNode.id, to: toNode.id });
        } else {
          nodes.push(node);
          edges.push({ from: startNode.id, to: node.id, arrows: { to: false } });
          edges.push({ from: node.id, to: toNode.id, arrows: { from: false } });
        }
      }
    } else {
      nodes.push(node);
      graphNode.out.forEach((to) => {
        if (!graph[to].virtual) {
          edges.push({ from: node.id, to: graph[to].node.id });
        }
      });
    }
  });
  return { nodes, edges };
}

export type LayoutGraphParams<NodeId extends string | number, T extends Node<NodeId>> = {
  nodes: T[];
  edges: Edge<NodeId>[];
  options?: LayeredLayoutOptions;
};

export async function layoutGraph<NodeId extends string | number, T extends Node<NodeId> = Node<NodeId>>({
  nodes,
  edges,
  options,
}: LayoutGraphParams<NodeId, T>) {
  const opts = resolveLayoutOptions(options);
  const enormousGraph =
    nodes.length > opts.enormousGraphNodeThreshold || edges.length > opts.enormousGraphEdgeThreshold;
  const { graph, layering, levels } = getGraph(nodes, edges);
  prepareGraph(graph as GraphInternal, layering, levels);
  const order = ordering(graph as GraphInternal, layering, enormousGraph);
  position(graph as GraphInternal, order, opts);
  return prepareResult<NodeId, T>(graph);
}
