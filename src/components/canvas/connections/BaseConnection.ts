import { Component } from "../../../lib";
import { TComponentState } from "../../../lib/Component";
import { ConnectionState, TConnection, TConnectionId } from "../../../store/connection/ConnectionState";
import { selectConnectionById } from "../../../store/connection/selectors";
import { TPoint } from "../../../utils/types/shapes";
import { GraphComponent, GraphComponentContext } from "../GraphComponent";
import { TAnchor } from "../anchors";
import { Block } from "../blocks/Block";

export type TBaseConnectionProps = {
  id: TConnectionId;
};

export type TBaseConnectionState = TComponentState &
  TConnection & {
    hovered?: boolean;
  };

export class BaseConnection<
  Props extends TBaseConnectionProps = TBaseConnectionProps,
  State extends TBaseConnectionState = TBaseConnectionState,
  Context extends GraphComponentContext = GraphComponentContext,
  Connection extends TConnection = TConnection,
> extends GraphComponent<Props, State, Context> {
  protected get sourceBlock(): Block {
    return this.connectedState.$sourceBlock.value?.getViewComponent();
  }

  protected get targetBlock(): Block {
    return this.connectedState.$targetBlock.value?.getViewComponent();
  }

  protected get sourceAnchor(): TAnchor | undefined {
    return this.sourceBlock.connectedState.getAnchorById(this.connectedState.sourceAnchorId)?.asTAnchor();
  }
  protected get targetAnchor(): TAnchor | undefined {
    return this.targetBlock.connectedState.getAnchorById(this.connectedState.targetAnchorId)?.asTAnchor();
  }

  public connectionPoints: [TPoint, TPoint] | undefined;

  public anchorsPoints: [TPoint, TPoint] | undefined;

  protected connectedState: ConnectionState<Connection>;

  protected bBox: [minX: number, minY: number, maxX: number, maxY: number];

  constructor(props: Props, parent: Component) {
    super(props, parent);

    this.connectedState = selectConnectionById(this.context.graph, this.props.id) as ConnectionState<Connection>;

    this.setState({ ...(this.connectedState.$state.value as TBaseConnectionState), hovered: false });
  }

  protected willMount(): void {
    this.subscribeSignal(this.connectedState.$selected, (selected) => {
      this.setState({ selected });
    });
    this.subscribeSignal(this.connectedState.$state, (state) => {
      this.setState({ ...state });
    });

    this.subscribeSignal(this.connectedState.$geometry, () => {
      this.updatePoints();
    });

    this.listenEvents(["mouseenter", "mouseleave"]);
  }

  protected override handleEvent(event) {
    event.stopPropagation();
    super.handleEvent(event);

    switch (event.type) {
      case "mouseenter":
        this.setState({ hovered: true });
        break;
      case "mouseleave":
        this.setState({ hovered: false });
        break;
    }
  }

  protected updatePoints() {
    if (!this.sourceBlock || !this.targetBlock) return;

    this.connectionPoints = [this.sourceBlock.getConnectionPoint("out"), this.targetBlock.getConnectionPoint("in")];
    if (this.sourceAnchor && this.targetAnchor) {
      this.anchorsPoints = [
        this.sourceBlock.getConnectionAnchorPosition(this.sourceAnchor),
        this.targetBlock.getConnectionAnchorPosition(this.targetAnchor),
      ];
    } else {
      this.anchorsPoints = undefined;
    }
    const x = [
      this.connectionPoints[0].x,
      this.connectionPoints[1].x,
      this.anchorsPoints?.[0].x || Infinity,
      this.anchorsPoints?.[1].x || Infinity,
    ];
    const y = [
      this.connectionPoints[0].y,
      this.connectionPoints[1].y,
      this.anchorsPoints?.[0].y || Infinity,
      this.anchorsPoints?.[1].y || Infinity,
    ];

    this.bBox = [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)];

    this.updateHitBox();
  }

  protected getBBox(): Readonly<[sourceX: number, sourceY: number, targetX: number, targetY: number]> {
    return this.bBox;
  }

  private updateHitBox = () => {
    const [x1, y1, x2, y2] = this.getBBox();
    const threshold = this.context.constants.connection.THRESHOLD_LINE_HIT;
    this.setHitBox(
      Math.min(x1, x2) - threshold,
      Math.min(y1, y2) - threshold,
      Math.max(x1, x2) + threshold,
      Math.max(y1, y2) + threshold
    );
  };
}
