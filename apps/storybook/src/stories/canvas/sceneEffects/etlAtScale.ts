import type { Graph, TRect } from "@gravity-ui/graph";

import { etlBlocks, etlFlows, getFlowStatus } from "../webglConnections/etl";
import type { TEtlConnection, TEtlStageStatus } from "../webglConnections/etl";

import { DEFAULT_STAGE_STATUS, STAGE_IS, dimmedTag, statusTag } from "./stageBlock";
import type { TStageBlock, TStageStatus } from "./stageBlock";

const PIPELINE_COLUMNS = 7;
const PIPELINE_ROWS = 8;
/** etl.ts places its rows 180 units apart; 220 leaves room for the thick far-zoom rings between the stages. */
const ROW_PITCH = 220;
const TEMPLATE_ROW_PITCH = 180;
const PIPELINE_PITCH_X = 2880;
const PIPELINE_PITCH_Y = 1120;

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

/**
 * 56 copies of etl.ts's pipeline (19 stages, 25 flows) in a 7 × 8 grid: 1064 stages, 1400 flows, 56 groups. Ids are
 * prefixed per pipeline ("p07/orders"); the statuses are random but the same on every load.
 */
export function createEtlAtScale(): TEtlAtScale {
  const random = createRandom(20261116);
  const blocks: TStageBlock[] = [];
  const connections: TEtlConnection[] = [];
  const pipelines: string[] = [];
  const statuses = new Map<string, TStageStatus>();
  for (let index = 0; index < PIPELINE_COLUMNS * PIPELINE_ROWS; index++) {
    const pipeline = `p${String(index + 1).padStart(2, "0")}`;
    pipelines.push(pipeline);
    const originX = (index % PIPELINE_COLUMNS) * PIPELINE_PITCH_X;
    const originY = Math.floor(index / PIPELINE_COLUMNS) * PIPELINE_PITCH_Y;
    for (const stage of etlBlocks) {
      const id = `${pipeline}/${stage.id}`;
      statuses.set(id, randomStatus(random));
      blocks.push({
        is: STAGE_IS,
        id,
        name: stage.name,
        kind: stage.kind,
        pipeline,
        group: pipeline,
        rowsPerSecond: Math.round((stage.rowsPerSecond ?? 1000) * (0.5 + random())),
        x: originX + stage.x,
        y: originY + (stage.y / TEMPLATE_ROW_PITCH) * ROW_PITCH,
        width: stage.width,
        height: stage.height,
        anchors: [],
      });
    }
    for (const flow of etlFlows) {
      const source = `${pipeline}/${flow.sourceBlockId}`;
      const target = `${pipeline}/${flow.targetBlockId}`;
      connections.push({
        id: `${pipeline}/${flow.id}`,
        sourceBlockId: source,
        targetBlockId: target,
        volume: flow.volume,
        status: getFlowStatus(
          toEtlStatus(statuses.get(source) ?? DEFAULT_STAGE_STATUS),
          toEtlStatus(statuses.get(target) ?? DEFAULT_STAGE_STATUS)
        ),
      });
    }
  }
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
        status: getFlowStatus(this.etlStatus(source), this.etlStatus(target)),
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

  private etlStatus(id: string): TEtlStageStatus {
    return toEtlStatus(this.statusOf(id));
  }
}
