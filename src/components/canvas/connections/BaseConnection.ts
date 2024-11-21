import { Component } from "../../../lib";
import { TComponentState } from "../../../lib/Component";
import { ConnectionState, TConnection, TConnectionId } from "../../../store/connection/ConnectionState";
import { selectConnectionById } from "../../../store/connection/selectors";
import { TPoint } from "../../../utils/types/shapes";
import { TAnchor } from "../anchors";
import { Block } from "../blocks/Block";
import { GraphComponent, GraphComponentContext } from "../graphComponent";

export type TBaseConnectionProps = {
  id: TConnectionId;
  addInRenderOrder(cmp, setting: object): void;
  removeFromRenderOrder(cmp): void;
}

export type TBaseConnectionState = TComponentState & TConnection & {
  hovered?: boolean;
};


export class BaseConnection<
  Props extends TBaseConnectionProps = TBaseConnectionProps,
  State extends TBaseConnectionState = TBaseConnectionState,
  Context extends GraphComponentContext = GraphComponentContext
> extends GraphComponent<Props, State, Context> {

  protected sourceBlock: Block;

  protected sourceAnchor?: TAnchor;

  protected targetBlock: Block;

  protected targetAnchor?: TAnchor;

  public connectedState: ConnectionState;

  protected geometry = { x1: 0, x2: 0, y1: 0, y2: 0 };

  constructor(props: Props, parent: Component) {
    super(props, parent);

    this.connectedState = selectConnectionById(this.context.graph, this.props.id);
    this.setState({ ...this.connectedState.$state.value as TBaseConnectionState, hovered: false });

    this.subscribeSignal(this.connectedState.$state, (state) => {
      this.setState({ ...state });
      this.updateSourceAndTargetBlock();
      this.updateHitBox();
    });
    this.subscribeSignal(this.connectedState.$geometry, () => {
      this.updateGeometry(this.sourceBlock, this.targetBlock);
    })

    this.listenEvents(["mouseenter", 'mouseleave']);
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

  protected updateGeometry(sourceBlock: Block, targetBlock: Block) {
    if (!sourceBlock || !targetBlock) return;
    const scale = this.context.camera.getCameraScale();
    const isSchematicView = scale < this.context.constants.connection.SCALES[1];

    let sourcePos: TPoint | undefined;
    let targetPos: TPoint | undefined;
    if (isSchematicView || (!this.sourceAnchor && !this.targetAnchor)) {
      sourcePos = sourceBlock.getConnectionPoint("out");
      targetPos = targetBlock.getConnectionPoint("in");
    } else if (
      this.context.graph.rootStore.settings.getConfigFlag("useBlocksAnchors") &&
      this.sourceAnchor &&
      this.targetAnchor
    ) {
      sourcePos = sourceBlock.getConnectionAnchorPosition(this.sourceAnchor);
      targetPos = targetBlock.getConnectionAnchorPosition(this.targetAnchor);
    }

    if (sourcePos && targetPos) {
      this.geometry.x1 = sourcePos.x;
      this.geometry.y1 = sourcePos.y;
      this.geometry.x2 = targetPos.x;
      this.geometry.y2 = targetPos.y;
      this.updateHitBox();
    }
  }

  protected updateSourceAndTargetBlock() {
    this.sourceBlock = this.connectedState.$sourceBlock.value?.getViewComponent();
    this.targetBlock = this.connectedState.$targetBlock.value?.getViewComponent();

    if (this.connectedState.sourceAnchorId && this.connectedState.targetAnchorId) {
      this.sourceAnchor = this.sourceBlock.connectedState
        .getAnchorById(this.connectedState.sourceAnchorId)
        ?.asTAnchor();
      this.targetAnchor = this.targetBlock.connectedState
        .getAnchorById(this.connectedState.targetAnchorId)
        ?.asTAnchor();
    }
  }

  protected willIterate() {
    const [x1, y1, x2, y2] = this.getBBox()
    this.shouldRender = this.context.camera.isLineVisible(x1, y1, x2, y2);

    super.willIterate();
  }

  protected getBBox(): Readonly<[sourceX: number, sourceY: number, targetX: number, targetY: number]> {
    return [this.geometry.x1, this.geometry.y1, this.geometry.x2, this.geometry.y2] as const;
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

  public _iterate() {
    return super.iterate();
  }

  public iterate() {
    if (this.firstIterate) {
      return super.iterate();
    }
    return this.shouldRenderChildren;
  }

  public unmount() {
    super.unmount();
    this.props.removeFromRenderOrder(this);
  }
}