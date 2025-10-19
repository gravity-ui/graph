import React, { useRef, useState } from "react";

import { Gear } from "@gravity-ui/icons";
import {
  Button,
  Flex,
  Icon,
  Popup,
  SegmentedRadioGroup,
  SegmentedRadioGroupOptionProps,
  Text,
} from "@gravity-ui/uikit";

import { Graph } from "@gravity-ui/graph";

import { useRerender } from "./hooks";

const ConnectionVariants: SegmentedRadioGroupOptionProps[] = [
  { value: "bezier", content: "Bezier" },
  { value: "line", content: "Line" },
];

const ConnectionArrowsVariants: SegmentedRadioGroupOptionProps[] = [
  { value: "bezier", content: "Show" },
  { value: "line", content: "Hide" },
];

export function GraphSettings({ className, graph }: { className: string; graph: Graph }) {
  const rerender = useRerender();
  const settingBtnRef = useRef();
  const [settingsOpened, setSettingsOpened] = useState(false);
  return (
    <>
      <Button
        size="l"
        view={settingsOpened ? "action" : "raised"}
        className={className}
        ref={settingBtnRef}
        onClick={() => setSettingsOpened((prevOpen) => !prevOpen)}
      >
        <Icon data={Gear} />
      </Button>
      <Popup
        anchorRef={settingBtnRef}
        open={settingsOpened}
        onClose={() => setSettingsOpened(false)}
        placement={["right-end"]}
      >
        <Flex direction="column" className="settings-popup" gap={3}>
          <Text variant="subheader-2">Graph settings</Text>
          <Flex direction="column" gap={2}>
            <Text variant="subheader-1">Connection type</Text>
            <SegmentedRadioGroup
              size="l"
              onUpdate={(value) => {
                graph.updateSettings({
                  useBezierConnections: value === ConnectionVariants[0].value,
                });
                rerender();
              }}
              value={ConnectionVariants[graph.rootStore.settings.getConfigFlag("useBezierConnections") ? 0 : 1].value}
              options={ConnectionVariants}
            />
          </Flex>
          <Flex direction="column" gap={2}>
            <Text variant="subheader-1">Show arrows</Text>
            <SegmentedRadioGroup
              size="l"
              onUpdate={(value) => {
                graph.updateSettings({
                  showConnectionArrows: value === ConnectionArrowsVariants[0].value,
                });
                rerender();
              }}
              value={
                ConnectionArrowsVariants[graph.rootStore.settings.getConfigFlag("showConnectionArrows") ? 0 : 1].value
              }
              options={ConnectionArrowsVariants}
            />
          </Flex>
        </Flex>
      </Popup>
    </>
  );
}
