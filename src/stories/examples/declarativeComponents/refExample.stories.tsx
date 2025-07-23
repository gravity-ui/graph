import React, { useRef } from "react";

import type { Meta, StoryObj } from "@storybook/react";

import { DevToolsLayer } from "../../../plugins/devtools/DevToolsLayer";
import { GraphCanvas, GraphLayer, GraphPortal } from "../../../react-components";
import { useGraph } from "../../../react-components/hooks/useGraph";

const meta: Meta = {
  title: "Examples/Declarative Components/Ref Support",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

function RefExample() {
  const { graph } = useGraph({
    settings: {},
  });

  // Ref для получения доступа к слою DevTools
  const devToolsRef = useRef<DevToolsLayer>(null);

  // Ref для получения доступа к портальному слою
  const portalRef = useRef<any>(null);

  const handleToggleDevTools = () => {
    if (devToolsRef.current) {
      const isVisible = !devToolsRef.current.isHidden();
      if (isVisible) {
        devToolsRef.current.hide();
      } else {
        devToolsRef.current.show();
      }
    }
  };

  const handleTogglePortal = () => {
    if (portalRef.current) {
      const isVisible = !portalRef.current.isHidden();
      if (isVisible) {
        portalRef.current.hide();
      } else {
        portalRef.current.show();
      }
    }
  };

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      {/* Кнопки управления слоями */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1000,
          display: "flex",
          gap: "10px",
        }}
      >
        <button onClick={handleToggleDevTools}>Toggle DevTools Layer</button>
        <button onClick={handleTogglePortal}>Toggle Portal Layer</button>
      </div>

      <GraphCanvas graph={graph} renderBlock={() => <div>Block</div>}>
        {/* GraphLayer с ref для управления слоем DevTools */}
        <GraphLayer ref={devToolsRef} layer={DevToolsLayer} showRuler={true} rulerSize={20} />

        {/* GraphPortal с ref для управления пользовательским слоем */}
        <GraphPortal ref={portalRef} className="custom-portal-layer" zIndex={200} transformByCameraPosition={false}>
          <div
            style={{
              position: "absolute",
              top: 60,
              left: 10,
              padding: "10px",
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              color: "white",
              borderRadius: "4px",
              maxWidth: "300px",
            }}
          >
            <h3>Custom Portal Layer</h3>
            <p>Этот слой создан с помощью GraphPortal и может быть управляем через ref.</p>
            <p>
              <strong>Использование ref:</strong>
              <br />
              - DevTools Layer: управление видимостью
              <br />- Portal Layer: прямой доступ к методам слоя
            </p>
          </div>
        </GraphPortal>
      </GraphCanvas>
    </div>
  );
}

export const RefSupport: Story = {
  render: () => <RefExample />,
  parameters: {
    docs: {
      description: {
        story: `
### Поддержка Ref в GraphPortal и GraphLayer

Этот пример демонстрирует использование \`ref\` для получения прямого доступа к экземплярам слоев:

#### GraphLayer с ref
\`\`\`tsx
const devToolsRef = useRef<DevToolsLayer>(null);

<GraphLayer
  ref={devToolsRef}
  layer={DevToolsLayer}
  showRuler={true}
  rulerSize={20}
/>

// Использование
devToolsRef.current?.hide();
devToolsRef.current?.show();
\`\`\`

#### GraphPortal с ref
\`\`\`tsx
const portalRef = useRef<GraphPortalLayer>(null);

<GraphPortal
  ref={portalRef}
  className="custom-layer"
  zIndex={200}
>
  <div>Portal content</div>
</GraphPortal>

// Использование
portalRef.current?.hide();
portalRef.current?.show();
\`\`\`

Кнопки в примере демонстрируют управление слоями через ref.
        `,
      },
    },
  },
};
