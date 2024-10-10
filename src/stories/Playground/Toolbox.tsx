import React from "react";
import { Flex, Tooltip, Button, Icon } from "@gravity-ui/uikit";
import { MagnifierPlus, MagnifierMinus, SquareDashed, Gear } from '@gravity-ui/icons';
import { Graph } from "../../graph";
import { useRerender } from './hooks';

export function Toolbox({className, graph}: {className: string, graph: Graph}) {
  const rerender = useRerender();
  return <Flex grow={1} justifyContent="center" className={className} direction="column">
    <Tooltip content="Zoom +" placement="right">
      <Button
        onClick={() => {
          graph.zoom({ scale: graph.cameraService.getCameraScale() + 0.08 });
          rerender();
        }}
        disabled={graph.cameraService.getCameraScale() >= 1}
      >
        <Icon data={MagnifierPlus} />
      </Button>
    </Tooltip>
    <Tooltip content="Fit to viewport" placement="right">
      <Button onClick={() => {
        graph.zoomTo('center');
        rerender();
      }}>
        <Icon data={SquareDashed} />
      </Button>
    </Tooltip>
    <Tooltip content="Zoom -" placement="right">
      <Button onClick={() => {
        graph.zoom({ scale: graph.cameraService.getCameraScale() - 0.08 });
        rerender();
      }}
        disabled={graph.cameraService.getCameraScale() <= 0.01}>
        <Icon data={MagnifierMinus} />
      </Button>
    </Tooltip>
  </Flex>
}