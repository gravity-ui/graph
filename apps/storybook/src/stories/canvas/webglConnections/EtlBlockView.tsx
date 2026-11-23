import React, { useState } from "react";

import type { Graph } from "@gravity-ui/graph";
import { GraphBlock } from "@gravity-ui/graph-react";
import {
  ArrowDownToLine,
  ArrowRotateRight,
  ChartColumn,
  Database,
  FileText,
  Gear,
  Pause,
  Play,
  Server,
  ShieldCheck,
} from "@gravity-ui/icons";
import { Button, Icon, Label, Text } from "@gravity-ui/uikit";
import type { IconProps, LabelProps } from "@gravity-ui/uikit";

import { applyStageAction, etlStatusColors, etlStatusLabels, formatRows, getStageAction } from "./etl";
import type { TEtlAction, TEtlBlock, TEtlStageKind, TEtlStageStatus } from "./etl";

import "./EtlBlockView.css";

const kindIcons: Record<TEtlStageKind, IconProps["data"]> = {
  source: Database,
  extract: ArrowDownToLine,
  validate: ShieldCheck,
  transform: Gear,
  load: Server,
  consumer: ChartColumn,
};

const statusThemes: Record<TEtlStageStatus, LabelProps["theme"]> = {
  running: "info",
  succeeded: "success",
  idle: "normal",
  paused: "warning",
  failed: "danger",
};

const actions: Record<TEtlAction, { title: string; icon: IconProps["data"] }> = {
  run: { title: "Run", icon: Play },
  pause: { title: "Pause", icon: Pause },
  retry: { title: "Retry", icon: ArrowRotateRight },
};

/** Two fake log lines for the status of the stage. */
function getLogLines(block: TEtlBlock): string[] {
  const rows = formatRows(block.rowsPerSecond ?? 0);
  switch (block.status) {
    case "running":
      return [`INFO  batch committed, ${rows} rows/s`, "INFO  checkpoint saved"];
    case "succeeded":
      return [`INFO  run finished in ${block.duration ?? "—"}`, "INFO  output published"];
    case "paused":
      return [`INFO  paused at ${block.lastRun}`, "INFO  input is buffered"];
    case "failed":
      return [`ERROR ${block.error ?? "stage failed"}`, "WARN  retries exhausted (3/3)"];
    default:
      return ["INFO  waiting for input"];
  }
}

/** The buttons act on the stage: their presses must not reach the graph, where they would drag or select the block. */
function stopGraphEvent(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

type TMetricProps = { label: string; value: string };

const Metric = ({ label, value }: TMetricProps): React.JSX.Element => (
  <div className="etl-block__metric">
    <Text variant="caption-1" color="secondary">
      {label}
    </Text>
    <Text variant="body-1" className="etl-block__metric-value">
      {value}
    </Text>
  </div>
);

type TEtlBlockViewProps = { graph: Graph; block: TEtlBlock };

/** The React card of an ETL stage: status, metrics, the action of the stage and its logs. */
export const EtlBlockView = ({ graph, block }: TEtlBlockViewProps): React.JSX.Element => {
  const [logsOpen, setLogsOpen] = useState(false);
  const action = actions[getStageAction(block.status)];
  const running = block.status === "running";

  return (
    <GraphBlock graph={graph} block={block} className="etl-block">
      <div className="etl-block__stripe" style={{ background: etlStatusColors[block.status] }} />
      <div className="etl-block__header">
        <Icon className="etl-block__kind" data={kindIcons[block.kind]} size={16} />
        <Text variant="subheader-1" ellipsis className="etl-block__name" title={block.name}>
          {block.name}
        </Text>
        <Label size="xs" theme={statusThemes[block.status]}>
          {etlStatusLabels[block.status]}
        </Label>
      </div>
      {logsOpen ? (
        <div className="etl-block__logs">
          {getLogLines(block).map((line) => (
            <div key={line} className="etl-block__log-line">
              {line}
            </div>
          ))}
        </div>
      ) : (
        <div className="etl-block__metrics">
          <Metric
            label="Rows/s"
            value={running && block.rowsPerSecond !== undefined ? formatRows(block.rowsPerSecond) : "—"}
          />
          <Metric label="Last run" value={block.lastRun} />
          <Metric label="Duration" value={block.duration ?? "—"} />
        </div>
      )}
      {block.status === "failed" && block.error && (
        <Text variant="caption-2" color="danger" ellipsis className="etl-block__error" title={block.error}>
          {block.error}
        </Text>
      )}
      <div
        className="etl-block__footer"
        onMouseDown={stopGraphEvent}
        onClick={stopGraphEvent}
        onDoubleClick={stopGraphEvent}
      >
        <Button
          size="xs"
          view={block.status === "failed" ? "outlined-danger" : "outlined"}
          onClick={() => applyStageAction(graph, block.id, getStageAction(block.status))}
        >
          <Icon data={action.icon} size={12} />
          {action.title}
        </Button>
        <Button size="xs" view="flat-secondary" selected={logsOpen} title="Logs" onClick={() => setLogsOpen(!logsOpen)}>
          <Icon data={FileText} size={12} />
          Logs
        </Button>
      </div>
    </GraphBlock>
  );
};
