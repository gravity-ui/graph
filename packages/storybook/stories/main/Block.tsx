import React, { MouseEvent, useCallback } from "react";

import { Graph, TBlock } from "@gravity-ui/graph";
import { GraphBlock, GraphBlockAnchor } from "@gravity-ui/graph-react";
import { AbbrApi, Bug, Database } from "@gravity-ui/icons";
import { Button, Icon, Text } from "@gravity-ui/uikit";

import "./Block.css";

export type TBlockStoryProps = {
  graph: Graph;
  block: TBlock;
};

export const BlockStory: React.FC<TBlockStoryProps> = ({ graph, block }) => {
  const onClick = useCallback((e: MouseEvent) => {
    console.log("Propagation stopped. Event should not ");
    e.stopPropagation();
  }, []);
  return (
    <GraphBlock graph={graph} block={block} className="example-block">
      <div className="block-header" style={{ textAlign: "center" }}>
        <Text className="block-header-title" variant="header-1" color="primary">
          {block.name}
        </Text>
      </div>
      {block.anchors.map((anchor) => {
        return (
          <GraphBlockAnchor
            className="block-anchor"
            key={anchor.id}
            position="absolute"
            graph={graph}
            anchor={anchor}
          />
        );
      })}
      <div className="block-footer">
        <Button onClick={onClick} view="normal" size="l">
          <Icon data={Database} size={18} />
        </Button>
        <Button view="normal" size="l" onClick={onClick}>
          <Icon data={AbbrApi} size={18} />
        </Button>
        <Button onClick={onClick} view="normal" size="l">
          <Icon data={Bug} size={18} />
        </Button>
      </div>
    </GraphBlock>
  );
};
