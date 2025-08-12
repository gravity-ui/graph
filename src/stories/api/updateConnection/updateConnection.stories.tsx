import React, { useCallback, useRef } from "react";

import {
  Checkbox,
  CheckboxProps,
  Flex,
  SegmentedRadioGroup,
  SegmentedRadioGroupOptionProps,
  SegmentedRadioGroupProps,
  Select,
  SelectOption,
  SelectProps,
  Text,
  TextInput,
  TextInputProps,
  ThemeProvider,
} from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";

import { Graph } from "../../../graph";
import { TConnection } from "../../../index";
import { GraphComponentStory } from "../../main/GraphEditor";

import { graphConfig } from "./config";

import "@gravity-ui/uikit/styles/styles.css";

type TOnConnectionChange = (connection: Partial<TConnection>) => void;

const sourceBlockOptions: SelectOption[] = [
  { value: "OneLeft", content: "OneLeft" },
  { value: "TwoLeft", content: "TwoLeft" },
];
const targetBlockOptions: SelectOption[] = [
  { value: "OneRight", content: "OneRight" },
  { value: "TwoRight", content: "TwoRight" },
];
const strokeColors: SegmentedRadioGroupOptionProps[] = [
  { value: "#272727", content: "Default" },
  { value: "rgb(255, 190, 92)", content: "Yellow" },
  { value: "rgb(48, 170, 110)", content: "Green" },
  { value: "rgb(233, 3, 58)", content: "Red" },
];
const selectedStrokeColors: SegmentedRadioGroupOptionProps[] = [
  { value: "#ecc113", content: "Default" },
  { value: "rgb(211, 158, 80)", content: "Yellow" },
  { value: "rgb(45, 139, 93)", content: "Green" },
  { value: "rgb(189, 9, 53)", content: "Red" },
];

const GraphApp = () => {
  const graphRef = useRef<Graph | undefined>(undefined);

  const onConnectionChange: TOnConnectionChange = useCallback((connection) => {
    graphRef.current.api.updateConnection("OneLeft:TwoRight", connection);
  }, []);

  const onSourceBlockUpdate: SelectProps<string>["onUpdate"] = useCallback(
    (value) => {
      onConnectionChange({ sourceBlockId: value[0] });
    },
    [onConnectionChange]
  );

  const onTargetBlockUpdate: SelectProps<string>["onUpdate"] = useCallback(
    (value) => {
      onConnectionChange({ targetBlockId: value[0] });
    },
    [onConnectionChange]
  );

  const onLabelUpdate: TextInputProps["onUpdate"] = useCallback(
    (value) => {
      onConnectionChange({ label: value });
    },
    [onConnectionChange]
  );

  const onDashedUpdate: CheckboxProps["onUpdate"] = useCallback(
    (value) => {
      onConnectionChange({ dashed: value });
    },
    [onConnectionChange]
  );

  const onSelectedUpdate: CheckboxProps["onUpdate"] = useCallback(
    (value) => {
      onConnectionChange({ selected: value });
    },
    [onConnectionChange]
  );

  const onStrokeColorUpdate: SegmentedRadioGroupProps<string>["onUpdate"] = useCallback(
    (value) => {
      onConnectionChange({ styles: { background: value } });
    },
    [onConnectionChange]
  );

  const onSelectedStrokeColorUpdate: SegmentedRadioGroupProps<string>["onUpdate"] = useCallback(
    (value) => {
      onConnectionChange({ styles: { selectedBackground: value } });
    },
    [onConnectionChange]
  );

  return (
    <ThemeProvider theme={"light"}>
      <Flex className="toolbox" direction={"column"} width={320} gap={2} style={{ marginBottom: "10px" }}>
        <Flex direction={"row"} gap={2}>
          <Select
            options={sourceBlockOptions}
            placeholder="Source block"
            onUpdate={onSourceBlockUpdate}
            defaultValue={[sourceBlockOptions[0].content as string]}
          />
          <Select
            options={targetBlockOptions}
            placeholder="Target block"
            onUpdate={onTargetBlockUpdate}
            defaultValue={[targetBlockOptions[1].content as string]}
          />
        </Flex>
        <TextInput placeholder="Connection label" onUpdate={onLabelUpdate} />
        <Checkbox onUpdate={onDashedUpdate}>Dashed</Checkbox>
        <Checkbox onUpdate={onSelectedUpdate}>Selected</Checkbox>
        <Flex direction={"row"} gap={2} alignItems={"center"}>
          <Text>Stroke color</Text>
          <SegmentedRadioGroup
            name="group1"
            defaultValue={strokeColors[0].value}
            options={strokeColors}
            onUpdate={onStrokeColorUpdate}
          />
        </Flex>
        <Flex direction={"row"} gap={2} alignItems={"center"}>
          <Text>Selected stroke color</Text>
          <SegmentedRadioGroup
            name="group1"
            defaultValue={selectedStrokeColors[0].value}
            options={selectedStrokeColors}
            onUpdate={onSelectedStrokeColorUpdate}
          />
        </Flex>
      </Flex>
      <GraphComponentStory graphRef={graphRef} config={graphConfig}></GraphComponentStory>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Api/updateConnection",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
