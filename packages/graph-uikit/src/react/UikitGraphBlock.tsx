import React from "react";

import type { TGraphBlockProps } from "@gravity-ui/graph-react";
import { GraphBlock, GraphBlockAnchor, useBlockState, useSignal } from "@gravity-ui/graph-react";
import { Box, Flex, Text } from "@gravity-ui/uikit";
import type { BoxProps } from "@gravity-ui/uikit";

import type { TUikitBlock } from "../canvas/types";
import type { TUikitBlockTheme } from "../theme/types";

import { cx } from "./cx";

import "./UikitGraphBlock.css";

export function getUikitGraphBlockClassName(
  { selected, theme }: { selected: boolean; theme: TUikitBlockTheme },
  extra?: string
): string {
  return cx(
    "graph-uikit-block__surface",
    `graph-uikit-block__surface_theme_${theme}`,
    selected && "graph-uikit-block__surface_selected",
    extra
  );
}

/** Default content; mirrors the canvas Schematic layout of UikitBlock. */
export function UikitGraphBlockContent({ block }: { block: TUikitBlock }): React.ReactElement {
  return (
    <Flex direction="column" gap={1}>
      <Text variant="subheader-1" ellipsis>
        {block.name}
      </Text>
      {block.meta?.description ? (
        <Text variant="caption-2" color="secondary" ellipsis>
          {block.meta.description}
        </Text>
      ) : null}
    </Flex>
  );
}

export type TUikitGraphBlockProps<T extends TUikitBlock> = Omit<TGraphBlockProps<T>, "children"> & {
  boxProps?: BoxProps;
  /** Replaces the default content. */
  children?: React.ReactNode;
};

/** Detailed-level block: GraphBlock + a uikit Box surface that matches the canvas UikitBlock. */
export function UikitGraphBlock<T extends TUikitBlock>({
  graph,
  block,
  className,
  boxProps,
  children,
  ...graphBlockProps
}: TUikitGraphBlockProps<T>): React.ReactElement {
  const state = useBlockState(graph, block);
  const selected = useSignal(state?.$selected) ?? false;
  const theme = block.meta?.theme ?? "normal";

  return (
    <GraphBlock graph={graph} block={block} className={cx("graph-uikit-block", className)} {...graphBlockProps}>
      <Box {...boxProps} className={getUikitGraphBlockClassName({ selected, theme }, boxProps?.className)}>
        {children ?? <UikitGraphBlockContent block={block} />}
      </Box>
      {block.anchors?.map((anchor) => (
        <GraphBlockAnchor
          key={anchor.id}
          graph={graph}
          anchor={anchor}
          position="fixed"
          className="graph-uikit-block__anchor"
        />
      ))}
    </GraphBlock>
  );
}
