import React, { useState } from "react";

import { MagnifierMinus, MagnifierPlus, SquareDashed } from "@gravity-ui/icons";
import { Button, Flex, Icon, Tooltip } from "@gravity-ui/uikit";

import { Graph } from "../../graph";
import { useGraphEvent } from "../../react-component";

export function Toolbox({ className, graph }: { className: string; graph: Graph }) {
  const [scale, setScale] = useState(1);

  useGraphEvent(graph, "camera-change", ({ scale }) => {
    setScale(scale);
  });
  return (
    <Flex grow={1} justifyContent="center" className={className} direction="column">
      <Tooltip content="Zoom in" placement="right">
        <Button
          size="l"
          view="raised"
          onClick={() => {
            graph.zoom({ scale: graph.cameraService.getCameraScale() + 0.08 });
          }}
          disabled={scale >= graph.cameraService.getCameraState().scaleMax}
        >
          <Icon data={MagnifierPlus} />
        </Button>
      </Tooltip>
      <Tooltip content="Fit to viewport" placement="right">
        <Button
          size="l"
          view="raised"
          onClick={() => {
            graph.zoomTo("center");
          }}
        >
          <Icon data={SquareDashed} />
        </Button>
      </Tooltip>
      <Tooltip content="Zoom out" placement="right">
        <Button
          size="l"
          view="raised"
          onClick={() => {
            graph.zoom({ scale: graph.cameraService.getCameraScale() - 0.08 });
          }}
          disabled={scale <= graph.cameraService.getCameraState().scaleMin}
        >
          <Icon data={MagnifierMinus} />
        </Button>
      </Tooltip>
    </Flex>
  );
}
