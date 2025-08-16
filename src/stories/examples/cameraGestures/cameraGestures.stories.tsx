import React, { useCallback, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import { GraphCanvas } from "../../../react-components/GraphCanvas";
import { generateExampleTree } from "../../plugins/elk/generateExampleTree";
import { getExampleConfig } from "../../plugins/elk/getExampleConfig";

const meta: Meta<typeof GraphCanvas> = {
  title: "Examples/Camera Gestures",
  component: GraphCanvas,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const CameraGesturesExample: React.FC = () => {
  const [events, setEvents] = useState<string[]>([]);
  const [config] = useState(() => getExampleConfig(generateExampleTree()));

  const addEvent = useCallback((eventName: string, data: any) => {
    setEvents((prev) => [
      `${eventName}: ${JSON.stringify(data, null, 2)}`,
      ...prev.slice(0, 9), // Показываем только последние 10 событий
    ]);
  }, []);

  const onPanStart = useCallback(
    (data: any) => {
      addEvent("Pan Start", data);
    },
    [addEvent]
  );

  const onPanMove = useCallback(
    (data: any) => {
      addEvent("Pan Move", data);
    },
    [addEvent]
  );

  const onPanEnd = useCallback(
    (data: any) => {
      addEvent("Pan End", data);
    },
    [addEvent]
  );

  const onPinchStart = useCallback(
    (data: any) => {
      addEvent("Pinch Start", data);
    },
    [addEvent]
  );

  const onPinchMove = useCallback(
    (data: any) => {
      addEvent("Pinch Move", data);
    },
    [addEvent]
  );

  const onPinchEnd = useCallback(
    (data: any) => {
      addEvent("Pinch End", data);
    },
    [addEvent]
  );

  const onTap = useCallback(
    (data: any) => {
      addEvent("Tap", data);
    },
    [addEvent]
  );

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ flex: 1 }}>
        <GraphCanvas
          config={config}
          onPanStart={onPanStart}
          onPanMove={onPanMove}
          onPanEnd={onPanEnd}
          onPinchStart={onPinchStart}
          onPinchMove={onPinchMove}
          onPinchEnd={onPinchEnd}
          onTap={onTap}
        />
      </div>
      <div
        style={{
          width: "300px",
          padding: "16px",
          backgroundColor: "#f5f5f5",
          borderLeft: "1px solid #ddd",
          overflowY: "auto",
        }}
      >
        <h3>Camera Gesture Events</h3>
        <p>Try these gestures on the graph:</p>
        <ul>
          <li><strong>Pan:</strong> Drag with mouse or finger to move camera</li>
          <li><strong>Pinch:</strong> Use two fingers to zoom in/out</li>
          <li><strong>Tap:</strong> Single tap/click on empty space</li>
        </ul>
        <hr />
        <h4>Event Log:</h4>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {events.map((event, index) => (
            <li
              key={index}
              style={{
                padding: "8px",
                margin: "4px 0",
                backgroundColor: "white",
                borderRadius: "4px",
                fontSize: "12px",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
              }}
            >
              {event}
            </li>
          ))}
        </ul>
        {events.length === 0 && (
          <p style={{ color: "#666", fontStyle: "italic" }}>
            No events yet. Try panning, pinching, or tapping on the graph.
          </p>
        )}
      </div>
    </div>
  );
};

export const Default: Story = {
  render: () => <CameraGesturesExample />,
};
