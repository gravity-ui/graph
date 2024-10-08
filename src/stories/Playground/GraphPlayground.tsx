import "@gravity-ui/uikit/styles/styles.css";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { TBlock } from "../../components/canvas/blocks/Block";
import { GraphState, Graph, TGraphConfig } from "../../graph";
import { useGraph, useGraphEvent, GraphCanvas, GraphProps } from "../../react-component";
import { useFn } from "../../utils/hooks/useFn";
import { ECanChangeBlockGeometry } from "../../store/settings";
import React from "react";
import { PlaygroundBlock } from "./GravityBlock/GravityBlock";
import { Flex, Text, ThemeContext, ThemeProvider } from "@gravity-ui/uikit";
import { StoryFn } from "storybook/internal/types";
import Editor from '@monaco-editor/react';

import './Playground.css';
import { GravityBlock } from "./GravityBlock";
import { IS_BLOCK_TYPE } from "../../store/block/Block";
import { createPlaygroundBlock, generatePlaygroundLayout, GravityBlockIS, TGravityBlock } from "./generateLayout";
import { ConfigEditor, ConfigEditorController } from "./Editor";

const generated = generatePlaygroundLayout(6, 12);

export function GraphPLayground() {
  const config = useMemo((): TGraphConfig => {
    return {
      blocks: [],
      connections: [],
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
      },
    };
  }, []);
  const { graph, setEntities, start } = useGraph({
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
      ...config.settings,
      blockComponents: {
        [GravityBlockIS]: GravityBlock
      }
    }
  });

  useGraphEvent(graph, 'connection-create-drop', ({targetBlockId, point}) => {
    if(!targetBlockId) {
      const block = createPlaygroundBlock(point.x, point.y, graph.rootStore.blocksList.$blocksMap.value.size + 1);
      graph.api.addBlock(block);
      graph.zoomTo([block.id], {transition: 250 });
    }
  });

  useLayoutEffect(() => {
    setEntities({ blocks: generated.blocks, connections: generated.connections });
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

  const ref = useRef<ConfigEditorController>(null);

  const onSelectBlock: GraphProps['onBlockSelectionChange'] = useCallback((selection) => {
    if (selection.list.length === 1) {
      ref?.current.scrollTo(selection.list[0]);
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
            <ConfigEditor ref={ref} blocks={config.blocks} connections={config.connections} />
          </Flex>
        </Flex>
      </Flex>
    </ThemeProvider>
  );
}

export const Default: StoryFn = () => <GraphPLayground />;