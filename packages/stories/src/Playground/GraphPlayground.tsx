import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  ConnectionLayer,
  ECanChangeBlockGeometry,
  Graph,
  GraphState,
  TBlock,
  TGraphConfig,
  random,
} from "@gravity-ui/graph";
import {
  GraphBlock,
  GraphCanvas,
  HookGraphParams,
  useFn,
  useGraph,
  useGraphEvent,
  useLayer,
} from "@gravity-ui/graph-react";
import {
  Flex,
  SegmentedRadioGroup,
  SegmentedRadioGroupOptionProps,
  SegmentedRadioGroupProps,
  Text,
  ThemeProvider,
} from "@gravity-ui/uikit";
import { StoryFn } from "storybook/internal/types";

import { EAnchorType } from "../configurations/definitions";

import { ActionBlock } from "./ActionBlock";
import { ConfigEditor, ConfigEditorController } from "./Editor";
import { GraphSettings } from "./Settings";
import { TextBlock } from "./TextBlock";
import { Toolbox } from "./Toolbox";
import {
  GravityActionBlockIS,
  GravityTextBlockIS,
  TGravityActionBlock,
  TGravityTextBlock,
  createActionBlock,
  createTextBlock,
  generatePlaygroundActionBlocks,
} from "./generateLayout";

import "./Playground.css";
import "@gravity-ui/uikit/styles/styles.css";

const generated = generatePlaygroundActionBlocks(0, 5);
const textBlocks = [
  createTextBlock(-144, 80, 448, 0, "To create new block, drag and drop new connection from edge"),
  createTextBlock(-64, 160, 240, 1, "Use scroll to zoom in or out"),
];

const config: HookGraphParams = {
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
        background: "rgba(255, 190, 92, 1)",
      },
      canvas: {
        layerBackground: "rgba(22, 13, 27, 1)",
        belowLayerBackground: "rgba(22, 13, 27, 1)",
        dots: "rgba(255, 255, 255, 0.2)",
        border: "rgba(255, 255, 255, 0.3)",
      },
    },
    constants: {
      block: {
        SCALES: [0.1, 0.2, 0.5],
      },
    },
  },
  settings: {
    canDragCamera: true,
    canZoomCamera: true,
    canDuplicateBlocks: false,
    canChangeBlockGeometry: ECanChangeBlockGeometry.ALL,
    canCreateNewConnections: true,
    showConnectionArrows: false,
    scaleFontSize: 1,
    useBezierConnections: true,
    useBlocksAnchors: true,
    showConnectionLabels: false,
    blockComponents: {
      [GravityActionBlockIS]: ActionBlock,
      [GravityTextBlockIS]: TextBlock,
    },
  },
};

const graphSizeOptions: SegmentedRadioGroupOptionProps[] = [
  { value: "1", content: "1" },
  { value: "100", content: "100" },
  { value: "1000", content: "1 000" },
  { value: "10000", content: "10 000" },
];

const createIcon = {
  path: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z", // Plus icon
  fill: "rgba(255, 190, 92, 1)",
  width: 24,
  height: 24,
  viewWidth: 24,
  viewHeight: 24,
};

// Icon for connection point
const pointIcon = {
  path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z", // Circle icon
  fill: "rgba(234, 201, 74, 1)",
  stroke: "rgba(255, 190, 92, 1)",
  width: 24,
  height: 24,
  viewWidth: 24,
  viewHeight: 24,
};

// Function for drawing connection line
const drawLine = (start, end) => {
  const path = new Path2D();
  path.moveTo(start.x, start.y);
  path.lineTo(end.x, end.y);
  return {
    path,
    style: {
      color: "rgba(255, 190, 92, 1)",
      dash: [5, 5], // Dashed line
    },
  };
};

export function GraphPLayground() {
  const { graph, setEntities, updateEntities, start } = useGraph(config);
  const editorRef = useRef<ConfigEditorController>(null);
  const [graphSize, setGraphSize] = useState<string>("1");

  useLayer(graph, ConnectionLayer, {
    createIcon,
    point: pointIcon,
    drawLine,
  });

  const getNextBlockIndex = useFn(() => {
    return Date.now();
  });

  const updateVisibleConfig = useFn(() => {
    const config = graph.rootStore.getAsConfig();
    editorRef?.current.setContent({
      blocks: config.blocks || [],
      connections: config.connections || [],
    });
  });

  useGraphEvent(graph, "block-change", ({ block }) => {
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
      })),
    ]);
  });

  useGraphEvent(
    graph,
    "connection-created",
    ({ sourceBlockId, sourceAnchorId, targetBlockId, targetAnchorId }, event) => {
      event.preventDefault();
      const pullSourceAnchor = graph.rootStore.blocksList.getBlockState(sourceBlockId).getAnchorById(sourceAnchorId);
      if (pullSourceAnchor.state.type === EAnchorType.IN) {
        graph.api.addConnection({
          sourceBlockId: targetBlockId,
          sourceAnchorId: targetAnchorId,
          targetBlockId: sourceBlockId,
          targetAnchorId: sourceAnchorId,
        });
      } else {
        graph.api.addConnection({
          sourceBlockId: sourceBlockId,
          sourceAnchorId: sourceAnchorId,
          targetBlockId: targetBlockId,
          targetAnchorId: targetAnchorId,
        });
      }
      updateVisibleConfig();
    }
  );

  useGraphEvent(graph, "connection-create-drop", ({ sourceBlockId, sourceAnchorId, targetBlockId, point }) => {
    if (targetBlockId) {
      return;
    }
    let block: TBlock;
    const pullSourceAnchor = graph.rootStore.blocksList.getBlockState(sourceBlockId).getAnchorById(sourceAnchorId);
    const nextIndex = getNextBlockIndex();
    if (pullSourceAnchor?.state.type === EAnchorType.IN) {
      block = createActionBlock(point.x - 126, point.y - 63, nextIndex);
      graph.api.addBlock(block);
      graph.api.addConnection({
        sourceBlockId: block.id,
        sourceAnchorId: block.anchors[1].id,
        targetBlockId: sourceBlockId,
        targetAnchorId: sourceAnchorId,
      });
    } else {
      block = createActionBlock(point.x, point.y - 63, nextIndex);
      graph.api.addBlock(block);
      graph.api.addConnection({
        sourceBlockId: sourceBlockId,
        sourceAnchorId: sourceAnchorId,
        targetBlockId: block.id,
        targetAnchorId: block.anchors[0].id,
      });
    }
    graph.zoomTo([block.id], { transition: 250 });
    updateVisibleConfig();
    editorRef?.current.scrollTo(block.id);
  });

  useLayoutEffect(() => {
    setEntities({ blocks: [...textBlocks, ...generated.blocks], connections: generated.connections });
    updateVisibleConfig();
  }, [setEntities]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 300 });
    }
  });

  const addNewBlock = useFn(() => {
    const rect = graph.api.getUsableRect();
    const x = random(rect.x, rect.x + rect.width + 100);
    const y = random(rect.y, rect.y + rect.height + 100);
    const nextIndex = getNextBlockIndex();
    const block = createActionBlock(x, y, nextIndex);
    graph.api.addBlock(block);
    graph.zoomTo([block.id], { transition: 250 });
    updateVisibleConfig();
    editorRef?.current.scrollTo(block.id);
  });

  const renderBlockFn = useFn((graph: Graph, block: TBlock) => {
    const view = graph.rootStore.blocksList.getBlockState(block.id)?.getViewComponent();
    if (view instanceof ActionBlock) {
      return view.renderHTML();
    }
    if (view instanceof TextBlock) {
      return view.renderHTML();
    }
    return (
      <GraphBlock graph={graph} block={block}>
        Unknown block <>{block.id.toLocaleString()}</>
      </GraphBlock>
    );
  });

  useGraphEvent(graph, "blocks-selection-change", ({ list }) => {
    if (list.length === 1) {
      editorRef?.current.scrollTo(list[0]);
    }
  });

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.code === "Backspace") {
        graph.api.deleteSelected();
        updateVisibleConfig();
      }
    };
    document.body.addEventListener("keydown", fn);
    return () => document.body.removeEventListener("keydown", fn);
  });

  const updateGraphSize = useFn<Parameters<SegmentedRadioGroupProps["onUpdate"]>, void>((value) => {
    let config: TGraphConfig<TGravityActionBlock | TGravityTextBlock>;
    setGraphSize(value);

    switch (value) {
      case graphSizeOptions[0].value: {
        config = generatePlaygroundActionBlocks(0, 5);
        break;
      }
      case graphSizeOptions[1].value: {
        config = generatePlaygroundActionBlocks(10, 100);
        break;
      }
      case graphSizeOptions[2].value: {
        config = generatePlaygroundActionBlocks(23, 150);
        break;
      }
      case graphSizeOptions[3].value: {
        graph.updateSettings({
          useBezierConnections: false,
        });
        config = generatePlaygroundActionBlocks(50, 150);
        break;
      }
    }
    setEntities(config);
    graph.zoomTo("center", { transition: 500 });
    updateVisibleConfig();
  });

  return (
    <ThemeProvider theme="dark">
      <Flex className="wrapper" gap={8}>
        <Flex direction="column" grow={1} className="content graph" gap={6}>
          <Flex direction="row" gap={4} alignItems="center">
            <Text variant="header-1">Blocks</Text>
            <SegmentedRadioGroup
              value={graphSize}
              className="graph-size-settings"
              options={graphSizeOptions}
              onUpdate={updateGraphSize}
              size="l"
            />
          </Flex>
          <Flex grow={1} className="view graph-editor">
            <Flex className="graph-tools" direction="column">
              <Toolbox graph={graph} className="graph-tools-zoom button-group" />
              <GraphSettings className="graph-tools-settings" graph={graph} />
            </Flex>
            <GraphCanvas graph={graph} renderBlock={renderBlockFn} />
          </Flex>
        </Flex>
        <Flex direction="column" grow={1} className="content" gap={6}>
          <Text variant="header-1">JSON Editor</Text>
          <Flex grow={1} className="view config-editor">
            <ConfigEditor
              ref={editorRef}
              onChange={({ blocks, connections }) => {
                updateEntities({ blocks, connections });
              }}
              addBlock={addNewBlock}
            />
          </Flex>
        </Flex>
      </Flex>
    </ThemeProvider>
  );
}

export const Default: StoryFn = () => <GraphPLayground />;
