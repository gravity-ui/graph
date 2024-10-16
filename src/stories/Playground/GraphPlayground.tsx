import { Flex, RadioButton, RadioButtonOption, RadioButtonProps, Text, ThemeProvider } from "@gravity-ui/uikit";
import "@gravity-ui/uikit/styles/styles.css";
import React, { useEffect, useLayoutEffect, useRef } from "react";
import { StoryFn } from "storybook/internal/types";
import { Graph, GraphState, TGraphConfig } from "../../graph";
import { GraphBlock, GraphCanvas, HookGraphParams, useGraph, useGraphEvent } from "../../react-component";
import { ECanChangeBlockGeometry } from "../../store/settings";
import { useFn } from "../../utils/hooks/useFn";

import { TBlock } from "../../components/canvas/blocks/Block";
import { random } from "../../components/canvas/blocks/generate";
import { EAnchorType } from "../configurations/definitions";
import { ConfigEditor, ConfigEditorController } from "./Editor";
import { createPlaygroundBlock, generatePlaygroundLayout, GravityBlockIS, TGravityBlock } from "./generateLayout";
import { GravityBlock } from "./GravityBlock";
import './Playground.css';
import { GraphSettings } from "./Settings";
import { Toolbox } from "./Toolbox";

const generated = generatePlaygroundLayout(0, 5);

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
        background: "rgba(255, 190, 92, 1)"
      },
      canvas: {
        layerBackground: "rgba(22, 13, 27, 1)",
        belowLayerBackground: "rgba(22, 13, 27, 1)",
        dots: "rgba(255, 255, 255, 0.2)",
        border: "rgba(255, 255, 255, 0.3)",
      }
    },
    constants: {
      block: {
        SCALES: [0.1, 0.2, 0.5]
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
};

const graphSizeOptions: RadioButtonOption[] = [
  {value: '1', content: 'S'},
  {value: '100', content: 'M'},
  {value: '1000', content: 'L'},
  {value: '10000', content: 'XL'},
];

export function GraphPLayground() {
  const { graph, setEntities, updateEntities, start } = useGraph(config);
  const editorRef = useRef<ConfigEditorController>(null);

  const updateVisibleConfig = useFn(() => {
    const config = graph.rootStore.getAsConfig();
    editorRef?.current.setContent({
      blocks: config.blocks || [],
      connections: config.connections || []
    });
  });

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

  useGraphEvent(graph, 'connection-created', ({sourceBlockId, sourceAnchorId, targetBlockId, targetAnchorId}, event) => {
    event.preventDefault();
    const pullSourceAnchor = graph.rootStore.blocksList.getBlockState(sourceBlockId).getAnchorById(sourceAnchorId);
    if (pullSourceAnchor.state.type === EAnchorType.IN) {
      graph.api.addConnection({
        sourceBlockId: targetBlockId,
        sourceAnchorId: targetAnchorId,
        targetBlockId: sourceBlockId,
        targetAnchorId: sourceAnchorId,
      })
    } else {
      graph.api.addConnection({
        sourceBlockId: sourceBlockId,
        sourceAnchorId: sourceAnchorId,
        targetBlockId: targetBlockId,
        targetAnchorId: targetAnchorId,
      })
    }
    updateVisibleConfig();
  });

  useGraphEvent(graph, 'connection-create-drop', ({sourceBlockId, sourceAnchorId, targetBlockId, point}) => {
    if (targetBlockId) {
      return;
    }
      let block: TBlock;
      const pullSourceAnchor = graph.rootStore.blocksList.getBlockState(sourceBlockId).getAnchorById(sourceAnchorId);
      if (pullSourceAnchor.state.type === EAnchorType.IN) {
        block = createPlaygroundBlock(point.x - 126, point.y - 63, graph.rootStore.blocksList.$blocksMap.value.size + 1);
        graph.api.addBlock(block);
        graph.api.addConnection({
          sourceBlockId: block.id,
          sourceAnchorId: block.anchors[1].id,
          targetBlockId: sourceBlockId,
          targetAnchorId: sourceAnchorId,
        })
      } else {
        block = createPlaygroundBlock(point.x, point.y - 63, graph.rootStore.blocksList.$blocksMap.value.size + 1);
        graph.api.addBlock(block);
        graph.api.addConnection({
          sourceBlockId: sourceBlockId,
          sourceAnchorId: sourceAnchorId,
          targetBlockId: block.id,
          targetAnchorId: block.anchors[0].id,
        })
      }
      graph.zoomTo([block.id], {transition: 250 });
      updateVisibleConfig();
      editorRef?.current.scrollTo(block.id);
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

  const addNewBlock = useFn(() => {
    const rect = graph.rootStore.blocksList.getUsableRect();
    const x = random(rect.x, rect.x + rect.width + 100);
    const y = random(rect.y, rect.y + rect.height + 100);
    const block = createPlaygroundBlock(x, y, graph.rootStore.blocksList.$blocksMap.value.size + 1);
    graph.api.addBlock(block);
    graph.zoomTo([block.id], { transition: 250 });
    updateVisibleConfig();
    editorRef?.current.scrollTo(block.id);
  });

  const renderBlockFn = useFn((graph: Graph, block: TBlock) => {
    const view = graph.rootStore.blocksList.getBlockState(block.id)?.getViewComponent()
    if (view instanceof GravityBlock) {
      return view.renderHTML();
    }
    return <GraphBlock graph={graph} block={block}>Unknown block <>{block.id}</></GraphBlock>
  });

  useGraphEvent(graph, 'blocks-selection-change', ({list}) => {
    if (list.length === 1) {
      editorRef?.current.scrollTo(list[0]);
    }
  });

  useEffect(() => {
    const fn = (e) => {
      if (e.code === 'Backspace') {
        graph.api.deleteSelected();
        updateVisibleConfig();
      }
    };
    document.body.addEventListener('keydown', fn);
    return () => document.body.removeEventListener('keydown', fn);
  });

  const updateGraphSize = useFn<Parameters<RadioButtonProps["onUpdate"]>, void>((value) => {
    let config: TGraphConfig<TGravityBlock>;
    switch(value) {
      case graphSizeOptions[0].value: {
        config = generatePlaygroundLayout(0, 5);
        break;
      }
      case graphSizeOptions[1].value: {
        config = generatePlaygroundLayout(10, 100);
        break;
      }
      case graphSizeOptions[2].value: {
        config = generatePlaygroundLayout(23, 150);
        break;
      }
      case graphSizeOptions[3].value: {
        graph.updateSettings({
          useBezierConnections: false
        });
        config = generatePlaygroundLayout(50, 150);
        break;
      }
    }
    setEntities(config);
    graph.zoomTo('center', {transition: 500});
    updateVisibleConfig();

  });

  return (
    <ThemeProvider theme="dark">
      <Flex className="wrapper" gap={8}>
        <Flex direction="column" grow={1} className="content graph" gap={6}>
          <Flex direction="row" gap={4} alignItems="center">
            <Text variant="header-1">Graph</Text>
            <RadioButton
              className="graph-size-settings"
              options={graphSizeOptions}
              onUpdate={updateGraphSize}
              size="l"
            ></RadioButton>
          </Flex>
          <Flex grow={1} className="view graph-editor">
            <Flex className="graph-tools" direction="column">
              <Toolbox graph={graph} className="graph-tools-zoom button-group"/>
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
              onChange={({blocks, connections}) => {
                updateEntities({blocks, connections})
              }}
              addBlock={addNewBlock} />
          </Flex>
        </Flex>
      </Flex>
    </ThemeProvider>
  );
}

export const Default: StoryFn = () => <GraphPLayground />;