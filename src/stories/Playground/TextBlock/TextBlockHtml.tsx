import { CircleInfo } from '@gravity-ui/icons';
import { Flex, Icon, Text } from '@gravity-ui/uikit';
import React from "react";
import { Graph } from "../../../graph";
import { GraphBlock } from "../../../react-component";
import { TGravityTextBlock } from "../generateLayout";
import "./TextBlock.css";

export function TextBlockHtml({ graph, block }: { graph: Graph, block: TGravityTextBlock }) {
  return (
    <GraphBlock graph={graph} block={block} className="text-block-wrapper">
      <Flex direction={"row"} gap={2} alignItems="center" grow={1}>
        <Icon className="icon" data={CircleInfo} size={18}/>
        <Text className="text-block-text" as="div" ellipsis variant="body-1">{block.meta.text}</Text>
        {/* <Icon className="icon" data={Xmark}  size={18}/> */}
      </Flex>
    </GraphBlock>
  )
}