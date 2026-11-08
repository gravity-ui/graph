import { dashFlow, pulse } from "@gravity-ui/graph";
import type { Graph, TBaseConnectionState, TBlock, TBlockId, TConnection } from "@gravity-ui/graph";

import { createConnections, glow, gradient, particles } from "./lines";
import type { TConnectionPair, TLook } from "./lines";

export type TEtlStageKind = "source" | "extract" | "validate" | "transform" | "load" | "consumer";
export type TEtlStageStatus = "running" | "succeeded" | "idle" | "paused" | "failed";
export type TEtlFlowStatus = "running" | "idle" | "failed";

export const ETL_BLOCK_IS = "etl-stage";

/** A stage of the pipeline: the canvas block and the React card both read these fields from the block state. */
export type TEtlBlock = TBlock & {
  is: typeof ETL_BLOCK_IS;
  kind: TEtlStageKind;
  status: TEtlStageStatus;
  /** The throughput of the stage; shown while it runs. */
  rowsPerSecond?: number;
  lastRun: string;
  duration?: string;
  error?: string;
};

export type TEtlConnection = TConnection & { volume: number; status: TEtlFlowStatus };

/** The effects a running flow can show; "plain" is a steady line. */
export type TEtlEffect = "comets" | "dash" | "pulse" | "particles" | "gradient" | "glow" | "plain";

const flowColor = "#2f7cf6";
const failedColor = "#e5484d";

/** One color per status for the stages and the flows: a running flow is blue, a flow into a failed stage red. */
export const etlStatusColors: Record<TEtlStageStatus, string> = {
  running: flowColor,
  succeeded: "#30a46c",
  idle: "#8b8d98",
  paused: "#f5a524",
  failed: failedColor,
};

/** The light fill of a far-away stage: the status color over white. */
export const etlStatusTints: Record<TEtlStageStatus, string> = {
  running: "#d5e5fd",
  succeeded: "#d6ede2",
  idle: "#e8e8eb",
  paused: "#fdedd3",
  failed: "#fadadb",
};

export const etlStatusLabels: Record<TEtlStageStatus, string> = {
  running: "Running",
  succeeded: "Succeeded",
  idle: "Idle",
  paused: "Paused",
  failed: "Failed",
};

export const etlKindBadges: Record<TEtlStageKind, string> = {
  source: "SRC",
  extract: "EXT",
  validate: "VAL",
  transform: "TRF",
  load: "LOAD",
  consumer: "OUT",
};

export function isEtlBlock(block: TBlock | undefined): block is TEtlBlock {
  return block?.is === ETL_BLOCK_IS;
}

/** 18400 → "18.4k". */
export function formatRows(rows: number): string {
  if (rows < 1000) return String(rows);
  const thousands = rows / 1000;
  return `${thousands < 100 ? Number(thousands.toFixed(1)) : Math.round(thousands)}k`;
}

/**
 * A flow takes its status from its stages: into a failed stage it fails; out of a failed, paused or idle stage it
 * waits; otherwise it runs.
 */
export function getFlowStatus(source: TEtlStageStatus, target: TEtlStageStatus): TEtlFlowStatus {
  if (target === "failed") return "failed";
  if (source === "failed" || source === "paused" || source === "idle") return "idle";
  return "running";
}

/** The selected effect, read by the lines in getStroke(): the look depends on data outside the connection's store. */
let etlEffect: TEtlEffect = "comets";

export function setEtlEffect(effect: TEtlEffect): void {
  etlEffect = effect;
}

/** The look of a running flow; `volume` (1..10, relative rows per second) sets speed, spacing and width. */
function runningLook(effect: TEtlEffect, volume: number): TLook {
  switch (effect) {
    case "comets": {
      // Short flows (200–450 units): a dense train of comets keeps every flow readable.
      const pattern = [40, 50];
      return {
        color: flowColor,
        width: 3 + volume * 0.5,
        pattern,
        effect: dashFlow.use({ pattern, speed: 40 + volume * 20, fade: true }),
      };
    }
    case "dash": {
      const pattern = [16, 10];
      return {
        color: flowColor,
        width: 2 + volume * 0.3,
        pattern,
        effect: dashFlow.use({ pattern, speed: 15 + volume * 10 }),
      };
    }
    case "pulse":
      return {
        color: flowColor,
        width: 3 + volume * 0.4,
        effect: pulse.use({ period: 4.5 - volume * 0.3, wavelength: 3000 }),
      };
    case "particles":
      return {
        color: flowColor,
        width: 12,
        effect: particles.use({ spacing: 150 - volume * 8, speed: 40 + volume * 20 }),
      };
    case "gradient":
      return {
        color: "#7a8aa6",
        width: 4 + volume * 0.4,
        effect: gradient.use({ from: [0.18, 0.49, 0.96], to: [0.95, 0.56, 0.17], laps: 0.1 + volume * 0.05 }),
      };
    case "glow":
      return { color: flowColor, width: 2 + volume * 0.3, effect: glow.use([]) };
    default:
      return { color: flowColor, width: 2 + volume * 0.4 };
  }
}

/** Failed and idle flows look the same for every effect; a running flow takes the selected one. */
export const etlConnections: TConnectionPair = createConnections((_id, state: TBaseConnectionState) => {
  const { status, volume = 1 } = state as TBaseConnectionState & Partial<TEtlConnection>;
  if (status === "failed") return { color: failedColor, width: 3, pattern: [10, 8] };
  if (status === "idle") return { color: "rgba(120, 120, 120, 0.6)", width: 1 };
  return runningLook(etlEffect, volume);
});

const blockWidth = 280;
const blockHeight = 136;
const gapX = 160;
const gapY = 44;

type TStageRow = [
  id: string,
  name: string,
  kind: TEtlStageKind,
  column: number,
  /** Fractional rows center a stage against the neighbouring columns. */
  row: number,
  status: TEtlStageStatus,
  rowsPerSecond: number,
  lastRun: string,
  duration: string,
];

const stages: TStageRow[] = [
  ["orders", "Orders DB", "source", 0, 0, "running", 18400, "now", "6h 12m"],
  ["clicks", "Clickstream (Kafka)", "source", 0, 1, "running", 52000, "now", "12d 4h"],
  ["crm", "CRM API", "source", 0, 2, "running", 900, "now", "2h 05m"],
  ["csv", "CSV uploads", "source", 0, 3, "running", 300, "now", "48m"],
  ["extract", "Extract orders", "extract", 1, 0, "running", 18200, "now", "6h 10m"],
  ["ingest", "Ingest events", "extract", 1, 1, "running", 51700, "now", "12d 4h"],
  ["pull", "Pull CRM", "extract", 1, 2, "failed", 900, "09:58", "4s"],
  ["read", "Read files", "extract", 1, 3, "succeeded", 2100, "10:15", "1m 32s"],
  ["validate", "Validate schema", "validate", 2, 0.5, "running", 16900, "now", "6h 08m"],
  ["dedup", "Deduplicate", "validate", 2, 1.5, "running", 48300, "now", "12d 4h"],
  ["mask", "Mask PII", "validate", 2, 2.5, "running", 1100, "now", "2h 01m"],
  ["join", "Join customers", "transform", 3, 0.5, "running", 15600, "now", "6h 05m"],
  ["sessionize", "Sessionize", "transform", 3, 1.5, "running", 39800, "now", "12d 4h"],
  ["daily", "Daily aggregates", "transform", 3, 2.5, "succeeded", 7400, "06:00", "14m 08s"],
  ["warehouse", "Warehouse", "load", 4, 0.5, "running", 21300, "now", "6h 02m"],
  ["lake", "Data lake", "load", 4, 2, "running", 44100, "now", "12d 4h"],
  ["bi", "BI dashboards", "consumer", 5, 0, "running", 2400, "now", "1h 20m"],
  ["ml", "ML features", "consumer", 5, 1.5, "paused", 3600, "08:30", "52m"],
  ["alerts", "Alerts", "consumer", 5, 3, "running", 640, "now", "3d 6h"],
];

const stageErrors: Record<string, string> = { pull: "CRM API 401: token expired" };

export const etlBlocks: TEtlBlock[] = stages.map(
  ([id, name, kind, column, row, status, rowsPerSecond, lastRun, duration]): TEtlBlock => ({
    is: ETL_BLOCK_IS,
    id,
    name,
    kind,
    status,
    rowsPerSecond,
    lastRun,
    duration,
    error: stageErrors[id],
    selected: false,
    x: column * (blockWidth + gapX),
    y: row * (blockHeight + gapY),
    width: blockWidth,
    height: blockHeight,
    anchors: [],
  })
);

const flows: [string, string, number][] = [
  ["orders", "extract", 9],
  ["clicks", "ingest", 10],
  ["crm", "pull", 4],
  ["csv", "read", 2],
  ["extract", "validate", 8],
  ["extract", "dedup", 3],
  ["ingest", "dedup", 9],
  ["read", "validate", 2],
  ["read", "mask", 2],
  ["pull", "mask", 1],
  ["validate", "join", 7],
  ["mask", "join", 3],
  ["validate", "daily", 5],
  ["dedup", "sessionize", 9],
  ["dedup", "daily", 4],
  ["join", "warehouse", 7],
  ["daily", "warehouse", 5],
  ["sessionize", "warehouse", 4],
  ["sessionize", "lake", 8],
  ["join", "lake", 3],
  ["warehouse", "bi", 6],
  ["warehouse", "ml", 4],
  ["lake", "ml", 6],
  ["warehouse", "alerts", 2],
  ["lake", "alerts", 3],
];

const initialStatus = new Map(etlBlocks.map((block) => [block.id, block.status]));

/** The flow statuses follow from the stages: the failed Pull CRM turns its input red and its output grey. */
export const etlFlows: TEtlConnection[] = flows.map(([source, target, volume]) => ({
  id: `${source}-${target}`,
  sourceBlockId: source,
  targetBlockId: target,
  volume,
  status: getFlowStatus(initialStatus.get(source) ?? "idle", initialStatus.get(target) ?? "idle"),
}));

export type TEtlAction = "run" | "pause" | "retry";

/** The one action a stage offers: a running stage pauses, a failed one retries, any other runs. */
export function getStageAction(status: TEtlStageStatus): TEtlAction {
  if (status === "running") return "pause";
  if (status === "failed") return "retry";
  return "run";
}

function getStageStatus(graph: Graph, id: TBlockId | undefined): TEtlStageStatus {
  const block = id === undefined ? undefined : graph.rootStore.blocksList.getBlockState(id)?.$state.value;
  return isEtlBlock(block) ? block.status : "idle";
}

/**
 * Applies an action to a stage and derives the status of every flow touching it again. The lines read `status` from
 * the connection state, so a flow turns red, grey or takes the selected effect on its own.
 */
export function applyStageAction(graph: Graph, id: TBlockId, action: TEtlAction): void {
  const clock = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const patch: { id: TBlockId } & Partial<TEtlBlock> =
    action === "pause"
      ? { id, status: "paused", lastRun: clock }
      : { id, status: "running", lastRun: "now", duration: "0s", error: undefined };
  graph.api.updateBlock(patch);

  for (const flow of graph.rootStore.blocksList.getBlockConnections(id)) {
    const update: Partial<TEtlConnection> = {
      status: getFlowStatus(getStageStatus(graph, flow.sourceBlockId), getStageStatus(graph, flow.targetBlockId)),
    };
    graph.api.updateConnection(flow.id, update);
  }
}
