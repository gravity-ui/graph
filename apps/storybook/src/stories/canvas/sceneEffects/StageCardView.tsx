import React, { useLayoutEffect, useRef } from "react";

import type { Graph } from "@gravity-ui/graph";
import { GraphBlock, GraphBlockAnchor } from "@gravity-ui/graph-react";
import { ArrowRotateRight, Pause, Play } from "@gravity-ui/icons";
import { Button, Icon } from "@gravity-ui/uikit";
import type { IconProps } from "@gravity-ui/uikit";
import type { ReadonlySignal } from "@preact/signals-core";

import { etlKindBadges, formatRows } from "../webglConnections/etl";

import { stageActionOf } from "./etlAtScale";
import type { TStageAction } from "./etlAtScale";
import { DashedRing, PulseRing, Spinner } from "./htmlEffects";
import { DEFAULT_STAGE_STATUS, stageStatusColors, stageStatusLabels, statusTag } from "./stageBlock";
import type { TStageBlock, TStageStatus } from "./stageBlock";
import { useTagValue } from "./useTagValue";

import "./StageCardView.css";

const actions: Record<TStageAction, { title: string; icon: IconProps["data"] }> = {
  run: { title: "Run", icon: Play },
  pause: { title: "Pause", icon: Pause },
  retry: { title: "Retry", icon: ArrowRotateRight },
};

/** The card's corner radius, as the scene block's. */
const RADIUS = 12;

/** The button acts on the stage: its presses must not reach the graph, where they would drag or select the block. */
function stopGraphEvent(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

/**
 * The status effects of the card, the CSS twins of the scene's: only the current status mounts its element. Two
 * differences from the scene: running shows the marching border only, without the throughput particles; and the
 * original selection mode uses a static box-shadow. GraphBlock draws the combined outline in the other modes.
 */
const StatusEffect = ({ status, block }: { status: TStageStatus; block: TStageBlock }): React.JSX.Element | null => {
  switch (status) {
    case "running":
      return (
        <DashedRing
          width={block.width}
          height={block.height}
          radius={RADIUS}
          thickness={4}
          color={stageStatusColors.running}
          on={16}
          off={10}
          speed={40}
        />
      );
    case "failed":
      return <PulseRing radius={RADIUS} thickness={6} period={1.2} color={stageStatusColors.failed} />;
    default:
      return null;
  }
};

type TStageCardViewProps = {
  graph: Graph;
  block: TStageBlock;
  /** Applies the stage's action through the story's simulation. */
  onAction: (id: string) => void;
  statusOpacity: ReadonlySignal<number>;
};

/**
 * The React card of a stage at the detailed level: it replaces the scene block (`GraphBlock`'s default
 * `autoHideCanvas`). The status is the `statusTag` value, read with `useTagValue`; the stripe takes the `body` part
 * colour the status rule computes (`--graph-block-body-color`, from `GraphBlock`); `selected` and the
 * `graph-tag-dimmed` class come from `GraphBlock` too.
 */
export const StageCardView = ({ graph, block, onAction, statusOpacity }: TStageCardViewProps): React.JSX.Element => {
  const status = useTagValue(graph, "block", block.id, statusTag) ?? DEFAULT_STAGE_STATUS;
  const action = actions[stageActionOf(status)];
  const chip = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = chip.current;
    if (!element) return undefined;
    // Only the chip fades. An inherited CSS variable invalidates the entire graph on every zoom step.
    return statusOpacity.subscribe((opacity) => {
      element.style.opacity = String(opacity);
    });
  }, [statusOpacity]);

  return (
    <GraphBlock graph={graph} block={block} className="scene-stage">
      <div className="scene-stage__body">
        <div className="scene-stage__stripe" />
        <div className="scene-stage__header">
          <span className="scene-stage__badge">{etlKindBadges[block.kind]}</span>
          <span className="scene-stage__pipeline">{block.pipeline.toUpperCase()}</span>
          <span ref={chip} className="scene-stage__status">
            {status === "queued" && (
              <Spinner
                size={11}
                thickness={2}
                color={stageStatusColors.queued}
                track="rgba(122, 90, 248, 0.2)"
                period={1}
              />
            )}
            {stageStatusLabels[status]}
          </span>
        </div>
        <div className="scene-stage__name" title={block.name}>
          {block.name}
        </div>
        <div className="scene-stage__footer">
          <span className="scene-stage__rows">{formatRows(block.rowsPerSecond)} rows/s</span>
          <div
            onMouseDown={stopGraphEvent}
            onMouseUp={stopGraphEvent}
            onClick={stopGraphEvent}
            onDoubleClick={stopGraphEvent}
            onTouchStart={stopGraphEvent}
            onTouchEnd={stopGraphEvent}
          >
            <Button
              size="xs"
              view={status === "failed" ? "outlined-danger" : "outlined"}
              onClick={() => onAction(String(block.id))}
            >
              <Icon data={action.icon} size={12} />
              {action.title}
            </Button>
          </div>
        </div>
      </div>
      <StatusEffect status={status} block={block} />
      {block.anchors?.map((anchor) => (
        <GraphBlockAnchor key={anchor.id} graph={graph} anchor={anchor} position="absolute" />
      ))}
    </GraphBlock>
  );
};
