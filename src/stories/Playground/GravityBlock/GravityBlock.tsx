import React from "react";
import { Button, Flex, Icon, Text } from '@gravity-ui/uikit'; 
import { Graph } from "../../../graph";
import { GraphBlock, GraphBlockAnchor } from "../../../react-component";
import { TGravityBlock } from "../generateLayout";
import {Database} from '@gravity-ui/icons';
import "./GravityBlock.css";

export function PlaygroundBlock({ graph, block }: { graph: Graph, block: TGravityBlock }) {
  return (
    <GraphBlock graph={graph} block={block} className="gravity-block-wrapper">
      {block.anchors.map((anchor) => {
        return (
          <GraphBlockAnchor
            className="gravity-block-achor"
            key={anchor.id}
            position="absolute"
            graph={graph}
            anchor={anchor}
          />
        );
      })}
      <Flex grow={1} direction={"column"}>
        <Text as="div" ellipsis variant="caption-2" className="gravity-block-name">{block.name}</Text>
        <Text as="div" ellipsis variant="caption-1" color="secondary">{block.meta.description}</Text>
      </Flex>
      <Flex>
        <Button onClick={(e) => e.stopPropagation()}><Icon data={Database} /></Button>
      </Flex>
    </GraphBlock>
  )
}