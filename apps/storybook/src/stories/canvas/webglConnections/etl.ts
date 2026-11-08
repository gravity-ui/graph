import { dashFlow, pulse } from "@gravity-ui/graph";
import type { TBaseConnectionState, TBlock, TConnection } from "@gravity-ui/graph";

import { createConnections, glow, gradient, particles } from "./lines";
import type { TConnectionPair, TLook } from "./lines";

export type TEtlConnection = TConnection & { volume: number; status: "running" | "idle" | "failed" };

/** The effects a running flow can show; "plain" is a steady line. */
export type TEtlEffect = "comets" | "dash" | "pulse" | "particles" | "gradient" | "glow" | "plain";

const flowColor = "#2f7cf6";

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
  if (status === "failed") return { color: "#e5484d", width: 3, pattern: [10, 8] };
  if (status === "idle") return { color: "rgba(120, 120, 120, 0.6)", width: 1 };
  return runningLook(etlEffect, volume);
});

const blockWidth = 220;
const blockHeight = 90;
const gapX = 190;
const gapY = 70;

const columns: [string, number, string][][] = [
  [
    ["Orders DB", 0, "orders"],
    ["Clickstream (Kafka)", 1, "clicks"],
    ["CRM API", 2, "crm"],
    ["CSV uploads", 3, "csv"],
  ],
  [
    ["Extract orders", 0, "extract"],
    ["Ingest events", 1, "ingest"],
    ["Pull CRM", 2, "pull"],
    ["Read files", 3, "read"],
  ],
  [
    ["Validate schema", 0.5, "validate"],
    ["Deduplicate", 1.5, "dedup"],
    ["Mask PII", 2.5, "mask"],
  ],
  [
    ["Join customers", 0.5, "join"],
    ["Sessionize", 1.5, "sessionize"],
    ["Daily aggregates", 2.5, "daily"],
  ],
  [
    ["Warehouse", 0.5, "warehouse"],
    ["Data lake", 2, "lake"],
  ],
  [
    ["BI dashboards", 0, "bi"],
    ["ML features", 1.5, "ml"],
    ["Alerts", 3, "alerts"],
  ],
];

export const etlBlocks: TBlock[] = columns.flatMap((column, columnIndex) =>
  column.map(
    ([name, row, id]): TBlock => ({
      is: "Block",
      id,
      name,
      selected: false,
      x: columnIndex * (blockWidth + gapX),
      y: row * (blockHeight + gapY),
      width: blockWidth,
      height: blockHeight,
      anchors: [],
    })
  )
);

const flows: [string, string, number, TEtlConnection["status"]?][] = [
  ["orders", "extract", 9],
  ["clicks", "ingest", 10],
  ["crm", "pull", 4, "failed"],
  ["csv", "read", 2],
  ["extract", "validate", 8],
  ["extract", "dedup", 3],
  ["ingest", "dedup", 9],
  ["read", "validate", 2],
  ["read", "mask", 2],
  ["pull", "mask", 1, "idle"],
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

export const etlFlows: TEtlConnection[] = flows.map(([source, target, volume, status = "running"]) => ({
  id: `${source}-${target}`,
  sourceBlockId: source,
  targetBlockId: target,
  volume,
  status,
}));
