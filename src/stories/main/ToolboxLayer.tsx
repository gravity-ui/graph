import React, { ChangeEvent, useCallback } from "react";

import ReactDOM from "react-dom/client";

import { Graph } from "../../graph";
import { Layer } from "../../services/Layer";

function Toolbox(props: { graph: Graph }) {
  const onChange = useCallback(
    (v: ChangeEvent<HTMLInputElement>) => {
      props.graph.zoom({ scale: Number(v.target.value) / 100 });
    },
    [props.graph]
  );
  return (
    <div onMouseDown={(e) => e.stopPropagation()}>
      <input type="range" onChange={onChange} min={1} max={100} />
    </div>
  );
}

export class ToolboxLayer extends Layer {
  protected reactRoot: ReactDOM.Root;

  constructor(props, context) {
    super(
      {
        html: {
          zIndex: 300,
          className: "custom-control",
        },
        ...props,
      },
      context
    );
  }

  protected override afterInit(): void {
    this.reactRoot = ReactDOM.createRoot(this.getHTML());
    this.reactRoot.render(<Toolbox graph={this.props.graph} />);
  }

  public unmount(): void {
    this.reactRoot?.unmount();
    super.unmount();
  }
}
