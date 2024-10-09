import { Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import "@gravity-ui/uikit/styles/styles.css";
import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { StoryFn } from "storybook/internal/types";
import { Graph, GraphState, TGraphConfig } from "../../graph";
import { GraphCanvas, GraphProps, useGraph, useGraphEvent } from "../../react-component";
import { ECanChangeBlockGeometry } from "../../store/settings";
import { useFn } from "../../utils/hooks/useFn";
import { PlaygroundBlock } from "./GravityBlock/GravityBlock";

import { ConfigEditor, ConfigEditorController } from "./Editor";
import { createPlaygroundBlock, generatePlaygroundLayout, GravityBlockIS, TGravityBlock } from "./generateLayout";
import { GravityBlock } from "./GravityBlock";
import './Playground.css';

const generated = generatePlaygroundLayout(0, 5);

export function GraphPLayground() {
  const { graph, setEntities, updateEntities, start } = useGraph({
    viewConfiguration: {
      colors: {
        selection: {
          background: "rgba(255, 190, 92, 0.1)",
          border: "rgba(255, 190, 92, 1)",
        },
        connection: {
          background: "rgba(255, 255, 255, 0.5)",
          selectedBackground: "rgba(234, 201, 74, 1)",
        },
        block: {
          background: "rgba(37, 27, 37, 1)",
          border: "rgba(229, 229, 229, 0.2)",
          selectedBorder: "rgba(255, 190, 92, 1)",
          text: "rgba(255, 255, 255, 1)",
        },
        anchor: {
          background: "rgba(255, 190, 92, 1)"
        },
        canvas: {
          layerBackground: "rgba(22, 13, 27, 1)",
          belowLayerBackground: "rgba(22, 13, 27, 1)",
          dots: "rgba(255, 255, 255, 0.2)",
          border: "rgba(255, 255, 255, 0.3)",
        }
      }
    },
    settings: {
      canDragCamera: true,
      canZoomCamera: true,
      canDuplicateBlocks: false,
      canChangeBlockGeometry: ECanChangeBlockGeometry.ALL,
      canCreateNewConnections: false,
      showConnectionArrows: false,
      scaleFontSize: 1,
      useBezierConnections: true,
      useBlocksAnchors: true,
      showConnectionLabels: false,
      blockComponents: {
        [GravityBlockIS]: GravityBlock
      }
    }
  });

  const updateVisibleConfig = useFn(() => {
    const config = graph.rootStore.getAsConfig();
    editorRef?.current.setContent({
      blocks: config.blocks || [],
      connections: config.connections || []
    });
  })

  useGraphEvent(graph, 'block-drag', ({block}) => {
    editorRef?.current.scrollTo(block.id);
  })

  useGraphEvent(graph, 'block-change', ({block}) => {
    editorRef?.current.updateBlocks([block]);
    editorRef?.current.scrollTo(block.id);
  });
  useGraphEvent(graph, "blocks-selection-change", ({ changes }) => {
    editorRef?.current.updateBlocks([
      ...changes.add.map((id) => ({
        ...graph.rootStore.blocksList.getBlock(id),
        selected: true,
      })),
      ...changes.removed.map((id) => ({
        ...graph.rootStore.blocksList.getBlock(id),
        selected: false,
      }))
    ]);
  });

  useGraphEvent(graph, 'connection-create-drop', ({sourceBlockId, sourceAnchorId, targetBlockId, point}) => {
    if(!targetBlockId) {
      const block = createPlaygroundBlock(point.x, point.y, graph.rootStore.blocksList.$blocksMap.value.size + 1);
      graph.api.addBlock(block);
      graph.api.addConnection({
        sourceBlockId,
        sourceAnchorId,
        targetBlockId: block.id,
        targetAnchorId: block.anchors[0].id,
      })
      graph.zoomTo([block.id], {transition: 250 });
      updateVisibleConfig();
      editorRef?.current.scrollTo(block.id);
    }
  });

  useLayoutEffect(() => {
    setEntities({ blocks: generated.blocks, connections: generated.connections });
    updateVisibleConfig();
  }, [setEntities]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 300 });
    }
  });

  const renderBlockFn = useFn((graph: Graph, block: TGravityBlock) => {
    const view = graph.rootStore.blocksList.getBlockState(block.id)?.getViewComponent()
    if (view instanceof GravityBlock) {
      return view.renderHTML();
    }
    return <PlaygroundBlock graph={graph} block={block} />
  });

  const editorRef = useRef<ConfigEditorController>(null);

  const onSelectBlock: GraphProps['onBlockSelectionChange'] = useCallback((selection) => {
    if (selection.list.length === 1) {
      editorRef?.current.scrollTo(selection.list[0]);
    }
  }, [graph]);



  return (
    <ThemeProvider theme="dark">
      <Flex className="wrapper" gap={8}>
        <Flex direction="column" grow={1} className="content graph" gap={6}>
          <Text variant="header-1">Graph viewer</Text>
          <Flex grow={1} className="view graph-editor">
            <GraphCanvas onBlockSelectionChange={onSelectBlock} graph={graph} renderBlock={renderBlockFn} />
          </Flex>
        </Flex>
        <Flex direction="column" grow={1} className="content" gap={6}>
          <Text variant="header-1">JSON Editor</Text>
          <Flex grow={1} className="view config-editor">
            <ConfigEditor onChange={({blocks, connections}) => {
              debugger;
              updateEntities({blocks, connections})
            }} ref={editorRef} />
          </Flex>
        </Flex>
      </Flex>
    </ThemeProvider>
  );
}

export const Default: StoryFn = () => <GraphPLayground />;