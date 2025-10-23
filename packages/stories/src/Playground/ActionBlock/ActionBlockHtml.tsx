import React from "react";

import { Graph } from "@gravity-ui/graph";
import { GraphBlock, GraphBlockAnchor } from "@gravity-ui/graph-react";
import { Database } from "@gravity-ui/icons";
import { Button, Flex, Icon, Text } from "@gravity-ui/uikit";

import { TGravityActionBlock } from "../generateLayout";

import "./ActionBlock.css";

export function ActionBlockHtml({ graph, block }: { graph: Graph; block: TGravityActionBlock }) {
  return (
    <GraphBlock graph={graph} block={block} className="action-block-wrapper">
      {block.anchors.map((anchor) => {
        return (
          <GraphBlockAnchor
            className="action-block-achor"
            key={anchor.id}
            position="absolute"
            graph={graph}
            anchor={anchor}
          />
        );
      })}
      <Flex grow={1} direction={"column"}>
        <Text as="div" ellipsis variant="caption-2" className="action-block-name">
          {block.name}
        </Text>
        <Text as="div" ellipsis variant="caption-1" color="secondary">
          {block.meta.description}
        </Text>
      </Flex>
      <Flex>
        <Button onClick={(e) => e.stopPropagation()}>
          <Icon data={Database} />
        </Button>
      </Flex>
    </GraphBlock>
  );
}
