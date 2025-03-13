import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button, Flex, RadioGroup, Switch, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { CanvasRulerLayer } from "../../../components/canvas/layers/canvasRulerLayer/CanvasRulerLayer";
import { Graph } from "../../../index";
import { GraphCanvas } from "../../../react-component/GraphCanvas";
import { useGraph } from "../../../react-component/hooks/useGraph";
import { useFn } from "../../../utils/hooks/useFn";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

const GraphApp = () => {
  const { graph, setEntities, start, addLayer, zoomTo } = useGraph({
    settings: {
      canCreateNewConnections: true,
    },
  });

  useEffect(() => {
    setEntities(generatePrettyBlocks({ layersCount: 3, connectionsPerLayer: 5, dashedLine: false }));
    start();
    zoomTo("center", { padding: 300 });
  }, [graph]);

  const rulerLayerRef = useRef<CanvasRulerLayer>(null);
  const [enabled, setEnabled] = useState(true);
  const [rulerTextColor, setRulerTextColor] = useState("#333333");
  const [rulerTickColor, setRulerTickColor] = useState("#666666");
  const [rulerBackgroundColor, setRulerBackgroundColor] = useState("#f0f0f0");

  useLayoutEffect(() => {
    rulerLayerRef.current = addLayer(CanvasRulerLayer, {
      rulerTextColor,
      rulerTickColor,
      rulerBackgroundColor,
    });

    return () => {
      if (rulerLayerRef.current) {
        graph.detachLayer(rulerLayerRef.current);
      }
    };
  }, []);

  // Update ruler colors when they change
  useEffect(() => {
    if (rulerLayerRef.current) {
      rulerLayerRef.current.setProps({
        rulerTextColor,
        rulerTickColor,
        rulerBackgroundColor,
      });
    }
  }, [rulerTextColor, rulerTickColor, rulerBackgroundColor]);

  const toggleRulerLayer = useFn((enabled: boolean) => {
    if (enabled) {
      if (!rulerLayerRef.current) {
        rulerLayerRef.current = addLayer(CanvasRulerLayer, {
          rulerTextColor,
          rulerTickColor,
          rulerBackgroundColor,
        });
      }
      setEnabled(true);
    } else {
      if (rulerLayerRef.current) {
        graph.detachLayer(rulerLayerRef.current);
        rulerLayerRef.current = null;
      }
      setEnabled(false);
    }
  });

  const handleZoom = (scale: number) => {
    const cameraState = graph.cameraService.getCameraState();
    graph.zoom({ scale: cameraState.scale * scale });
  };

  const colorPresets = [
    { value: "default", content: "Default" },
    { value: "dark", content: "Dark" },
    { value: "colorful", content: "Colorful" },
  ];

  const handleColorPresetChange = useFn((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    switch (value) {
      case "dark":
        setRulerTextColor("#ffffff");
        setRulerTickColor("#aaaaaa");
        setRulerBackgroundColor("#333333");
        break;
      case "colorful":
        setRulerTextColor("#ff5722");
        setRulerTickColor("#2196f3");
        setRulerBackgroundColor("#e0f7fa");
        break;
      default:
        setRulerTextColor("#333333");
        setRulerTickColor("#666666");
        setRulerBackgroundColor("#f0f0f0");
        break;
    }
  });

  const renderBlock = (graphInstance: Graph, block: TBlock) => {
    return <BlockStory graph={graphInstance} block={block} />;
  };

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">Canvas Ruler Layer Demo</Text>
          <Text variant="body-1">
            This layer adds horizontal and vertical rulers to the graph canvas, displaying the X and Y coordinates of
            the visible area. The rulers automatically adjust their tick spacing based on the camera scale.
          </Text>

          <Flex alignItems="center" gap={2}>
            <Switch checked={enabled} onChange={() => toggleRulerLayer(!enabled)} content="Show Rulers" />
          </Flex>

          <Flex alignItems="center" gap={2}>
            <Text variant="body-1">Color Theme:</Text>
            <RadioGroup options={colorPresets} defaultValue="default" onChange={handleColorPresetChange} />
          </Flex>

          <Flex alignItems="center" gap={2}>
            <Text variant="body-1">Zoom:</Text>
            <Button view="normal" onClick={() => handleZoom(1.2)}>
              Zoom In
            </Button>
            <Button view="normal" onClick={() => handleZoom(0.8)}>
              Zoom Out
            </Button>
            <Button view="normal" onClick={() => zoomTo("center", { padding: 300 })}>
              Reset
            </Button>
          </Flex>
        </Flex>
        <div style={{ flex: 1, position: "relative" }}>
          <GraphCanvas graph={graph} className="graph-canvas" renderBlock={renderBlock} />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/CanvasRulerLayer",
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
