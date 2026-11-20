import { Anchor, EAnchorType } from "@gravity-ui/graph";
import type { Graph, TAnchor, TGraphConstants, TRect } from "@gravity-ui/graph";

import { etlBlocks, etlFlows, getFlowStatus } from "../webglConnections/etl";
import type { TEtlConnection, TEtlStageStatus } from "../webglConnections/etl";

import { DEFAULT_STAGE_STATUS, STAGE_IS, dimmedTag, statusTag } from "./stageBlock";
import type { TStageBlock, TStageStatus } from "./stageBlock";

const TEMPLATE_ROW_PITCH = 180;
const PIPELINE_PITCH_X = 2880;
const STAGE_GAP = 40;
const PIPELINE_GAP = 144;

export type TEtlAtScale = {
  blocks: TStageBlock[];
  connections: TEtlConnection[];
  /** The pipeline ids; each pipeline is a group. */
  pipelines: string[];
  /** The initial status of every stage. */
  statuses: Map<string, TStageStatus>;
};

const RANDOM_MODULUS = 2147483647;

/** A seeded generator (Park–Miller), so the graph is the same on every load; values in [0, 1). */
function createRandom(seed: number): () => number {
  let state = (seed % (RANDOM_MODULUS - 1)) + 1;
  return (): number => {
    state = (state * 48271) % RANDOM_MODULUS;
    return (state - 1) / (RANDOM_MODULUS - 1);
  };
}

/** About the share each status has once the live simulation has run for a while. */
function randomStatus(random: () => number): TStageStatus {
  const r = random();
  if (r < 0.36) return "running";
  if (r < 0.64) return "queued";
  if (r < 0.84) return "succeeded";
  if (r < 0.91) return "paused";
  return "failed";
}

/** etl.ts's flows know no queue: a queued stage waits, as an idle one does. */
function toEtlStatus(status: TStageStatus): TEtlStageStatus {
  return status === "queued" ? "idle" : status;
}

export function pipelineRect(data: TEtlAtScale, pipeline: string): TRect {
  const blocks = data.blocks.filter((block) => block.pipeline === pipeline);
  const minX = Math.min(...blocks.map((block) => block.x));
  const minY = Math.min(...blocks.map((block) => block.y));
  const maxX = Math.max(...blocks.map((block) => block.x + block.width));
  const maxY = Math.max(...blocks.map((block) => block.y + block.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const MAX_ANCHORS_PER_SIDE = 4;

type TAnchoredStage = TStageBlock & { id: string; anchors: TAnchor[] };

function makeFlow(
  source: TAnchoredStage,
  target: TAnchoredStage,
  out: TAnchor,
  input: TAnchor,
  volume: number,
  statuses: ReadonlyMap<string, TStageStatus>
): TEtlConnection {
  return {
    id: `${source.id}:${out.id}→${target.id}:${input.id}`,
    sourceBlockId: source.id,
    sourceAnchorId: out.id,
    targetBlockId: target.id,
    targetAnchorId: input.id,
    volume,
    status: getFlowStatus(
      toEtlStatus(statuses.get(source.id) ?? DEFAULT_STAGE_STATUS),
      toEtlStatus(statuses.get(target.id) ?? DEFAULT_STAGE_STATUS)
    ),
  };
}

/** Neighbours in pipeline order come first. Dense graphs can route several flows through distinct port pairs. */
function fillFlows(
  connections: TEtlConnection[],
  count: number,
  blocks: readonly TAnchoredStage[],
  statuses: ReadonlyMap<string, TStageStatus>
): void {
  const existing = new Set(connections.map((flow) => flow.id));
  // A pair of stages may support up to 4 × 4 distinct flows. Try one port pair across the graph at a time.
  for (let pair = 0; pair < MAX_ANCHORS_PER_SIDE ** 2; pair++) {
    const outIndex = Math.floor(pair / MAX_ANCHORS_PER_SIDE);
    const inputIndex = pair % MAX_ANCHORS_PER_SIDE;
    for (let distance = 1; distance < blocks.length; distance++) {
      for (let i = 0; i + distance < blocks.length; i++) {
        const a = blocks[i];
        const b = blocks[i + distance];
        if (a.x === b.x) continue;
        const source = a.x < b.x ? a : b;
        const target = a.x < b.x ? b : a;
        const out = source.anchors[source.anchors.length / 2 + outIndex];
        const input = target.anchors[inputIndex];
        if (!out || input?.type !== EAnchorType.IN) continue;
        const flow = makeFlow(source, target, out, input, 1 + ((i + distance + pair) % 10), statuses);
        if (existing.has(flow.id)) continue;
        existing.add(flow.id);
        connections.push(flow);
        if (connections.length === count) return;
      }
    }
  }
  throw new RangeError(`Cannot create ${count} distinct flows for ${blocks.length} stages`);
}

/** A seeded grid of full pipelines and, when necessary, one partial pipeline. */
export function createEtlAtScale(
  blockCount: number,
  connectionCount: number,
  { block, system }: TGraphConstants
): TEtlAtScale {
  const grid = system.GRID_SIZE;
  const firstAnchor = block.HEAD_HEIGHT + block.BODY_PADDING;
  const anchorPadding = Math.ceil((Anchor.LOOK_EXTENT * Anchor.CANVAS_HOVER_FACTOR) / grid) * grid;
  // Match Block.getAnchorPosition(), including room below the last anchor when hovered.
  const anchorHeight = (count: number): number => firstAnchor + (count - 1) * grid * 2 + anchorPadding;
  const maxHeight = Math.max(anchorHeight(MAX_ANCHORS_PER_SIDE), ...etlBlocks.map((stage) => stage.height));
  const rowPitch = maxHeight + STAGE_GAP;
  const lastRow = Math.max(...etlBlocks.map((stage) => stage.y)) / TEMPLATE_ROW_PITCH;
  const pipelinePitchY = lastRow * rowPitch + maxHeight + PIPELINE_GAP;
  const random = createRandom(20261116);
  const blocks: TAnchoredStage[] = [];
  const templates: TEtlConnection[] = [];
  const pipelines: string[] = [];
  const statuses = new Map<string, TStageStatus>();
  const pipelineCount = Math.ceil(blockCount / etlBlocks.length);
  const columns = Math.ceil(Math.sqrt((pipelineCount * 7) / 8));
  for (let index = 0; index < pipelineCount; index++) {
    const pipeline = `p${String(index + 1).padStart(2, "0")}`;
    pipelines.push(pipeline);
    const originX = (index % columns) * PIPELINE_PITCH_X;
    const originY = Math.floor(index / columns) * pipelinePitchY;
    const stages = new Map<string, TAnchoredStage>();
    for (const stage of etlBlocks) {
      if (blocks.length === blockCount) break;
      const id = `${pipeline}/${stage.id}`;
      const count = 1 + ((index + stages.size) % MAX_ANCHORS_PER_SIDE);
      statuses.set(id, randomStatus(random));
      const block: TAnchoredStage = {
        is: STAGE_IS,
        id,
        name: stage.name,
        kind: stage.kind,
        pipeline,
        group: pipeline,
        rowsPerSecond: Math.round((stage.rowsPerSecond ?? 1000) * (0.5 + random())),
        x: originX + stage.x,
        y: originY + (stage.y / TEMPLATE_ROW_PITCH) * rowPitch,
        width: stage.width,
        height: Math.max(stage.height, anchorHeight(count)),
        anchors: Array.from({ length: count * 2 }, (_, i) => ({
          id: i < count ? `in-${i}` : `out-${i - count}`,
          blockId: id,
          type: i < count ? EAnchorType.IN : EAnchorType.OUT,
          index: i % count,
        })),
      };
      blocks.push(block);
      stages.set(String(stage.id), block);
    }
    for (const flow of etlFlows) {
      const source = stages.get(String(flow.sourceBlockId));
      const target = stages.get(String(flow.targetBlockId));
      if (!source || !target) continue;
      const outCount = source.anchors.length / 2;
      const inputCount = target.anchors.length / 2;
      const out = source.anchors[outCount + (flow.volume % outCount)];
      const input = target.anchors[flow.volume % inputCount];
      templates.push(makeFlow(source, target, out, input, flow.volume, statuses));
    }
  }
  // Picking a spread of the original routes keeps a sparse graph from concentrating flows in the first groups.
  const templateCount = Math.min(connectionCount, templates.length);
  const connections = Array.from(
    { length: templateCount },
    (_, i) => templates[Math.floor((i * templates.length) / templateCount)]
  );
  if (connections.length < connectionCount) fillFlows(connections, connectionCount, blocks, statuses);
  return { blocks, connections, pipelines, statuses };
}

/** The status a stage moves to: queued and paused stages run; a run succeeds, fails or pauses; a failure retries. */
function nextStatus(status: TStageStatus, random: () => number): TStageStatus {
  switch (status) {
    case "running": {
      const r = random();
      if (r < 0.55) return "succeeded";
      return r < 0.8 ? "failed" : "paused";
    }
    case "succeeded":
    case "failed":
      return "queued";
    default:
      return "running";
  }
}

export type TStageAction = "run" | "pause" | "retry";

/** The one action a stage offers: a running stage pauses, a failed one retries, any other runs. */
export function stageActionOf(status: TStageStatus): TStageAction {
  if (status === "running") return "pause";
  if (status === "failed") return "retry";
  return "run";
}

/** The status an action leads to: a retry is queued first, so its spinner shows until the stage runs. */
const actionResults: Record<TStageAction, TStageStatus> = { run: "running", pause: "paused", retry: "queued" };

/**
 * The live side of the ETL graph. The status of a stage is the `statusTag` value only: a change writes the tag (the
 * rules switch the effects, nothing is re-encoded) and the status of the touching flows with
 * `graph.api.updateConnection`, as `applyStageAction` does in etl.ts.
 */
export class EtlSimulation {
  private readonly statuses: Map<string, TStageStatus>;
  private readonly ids: string[];
  /** The flows touching each stage, and the ends of each flow. */
  private readonly flowsOf = new Map<string, string[]>();
  private readonly ends = new Map<string, [string, string]>();
  private readonly random = createRandom(7);
  private focus = false;

  constructor(
    private readonly graph: Graph,
    data: TEtlAtScale
  ) {
    this.statuses = new Map(data.statuses);
    this.ids = data.blocks.map((block) => String(block.id));
    for (const flow of data.connections) {
      const id = String(flow.id);
      const ends: [string, string] = [String(flow.sourceBlockId), String(flow.targetBlockId)];
      this.ends.set(id, ends);
      for (const end of ends) this.flowsOf.set(end, [...(this.flowsOf.get(end) ?? []), id]);
    }
  }

  /** Writes the status tag of every stage (the flows were created with their statuses). */
  public writeAll(): void {
    this.graph.scene.tags.set(statusTag, { block: new Map(this.statuses) });
    this.writeFocus();
  }

  /** Moves `count` random stages to their next status. */
  public tick(count: number): void {
    const changes = new Map<string, TStageStatus>();
    while (changes.size < count) {
      const id = this.ids[Math.floor(this.random() * this.ids.length)];
      if (!changes.has(id)) changes.set(id, nextStatus(this.statusOf(id), this.random));
    }
    this.write(changes);
  }

  /** Applies the stage's action (the HTML card's button) and returns the new status. */
  public act(id: string): TStageStatus {
    const status = actionResults[stageActionOf(this.statusOf(id))];
    this.write(new Map([[id, status]]));
    return status;
  }

  public statusOf(id: string): TStageStatus {
    return this.statuses.get(id) ?? DEFAULT_STAGE_STATUS;
  }

  /** "Focus on failures": the dimmed tag on every stage that has not failed. */
  public setFocus(on: boolean): void {
    this.focus = on;
    this.writeFocus();
  }

  public counts(): Record<TStageStatus, number> {
    const counts: Record<TStageStatus, number> = { running: 0, queued: 0, failed: 0, paused: 0, succeeded: 0 };
    for (const status of this.statuses.values()) counts[status]++;
    return counts;
  }

  /** Writes new statuses: the status tag, the touching flows and, while focused, the dimmed tag. */
  private write(changes: ReadonlyMap<string, TStageStatus>): void {
    for (const [id, status] of changes) this.statuses.set(id, status);
    // One write for all of them: `add` merges these values into the tag's members.
    this.graph.scene.tags.add(statusTag, { block: changes });

    const flows = new Set<string>();
    for (const id of changes.keys()) for (const flow of this.flowsOf.get(id) ?? []) flows.add(flow);
    for (const flow of flows) {
      const [source, target] = this.ends.get(flow) ?? ["", ""];
      const update: Partial<TEtlConnection> = {
        status: this.flowStatus(source, target),
      };
      this.graph.api.updateConnection(flow, update);
    }

    if (this.focus) {
      const failed = [...changes].filter(([, status]) => status === "failed").map(([id]) => id);
      const other = [...changes].filter(([, status]) => status !== "failed").map(([id]) => id);
      if (failed.length > 0) this.graph.scene.tags.delete(dimmedTag, { block: failed });
      if (other.length > 0) this.graph.scene.tags.add(dimmedTag, { block: other });
    }
  }

  private writeFocus(): void {
    if (!this.focus) {
      this.graph.scene.tags.clear(dimmedTag);
      return;
    }
    const other = this.ids.filter((id) => this.statuses.get(id) !== "failed");
    this.graph.scene.tags.set(dimmedTag, { block: other });
  }

  private flowStatus(source: string, target: string): TEtlConnection["status"] {
    return getFlowStatus(toEtlStatus(this.statusOf(source)), toEtlStatus(this.statusOf(target)));
  }
}
