import intersects from "intersects";
import { GraphLayer, TGraphLayerContext } from "../layers/graphLayer/GraphLayer";
import { ConnectionState, TConnection } from "../../../store/connection/ConnectionState";
import { selectConnectionById } from "../../../store/connection/selectors";
import { withHitTest } from "../../../mixins/withHitTest";
import { EventedComponent } from "../../../mixins/withEvents";
import { HitBoxData } from "../../../services/HitTest";
import { Block } from "../blocks/Block";
import withBatchedConnection from "./batchMixins/withBatchedConnection";
import { bezierCurveLine, generateBezierParams, getArrowCoords, isPointInStroke } from "./bezierHelpers";
import { getFontSize } from "../../../utils/functions/text";
import { getLabelCoords } from "./labelHelper";
import { frameDebouncer } from "../../../services/optimizations/frameDebouncer";
import { isMetaKeyEvent } from "../../../utils/functions";
import { TPoint } from "../../../utils/types/shapes";
import { cachedMeasureText } from "../../../utils/renderers/text";
import { TAnchor } from "../anchors";
import { ESelectionStrategy } from "../../../utils/types/types";

export type TConnectionProps = {
  id: string;
  addInRenderOrder(cmp, setting: object): void;
  removeFromRenderOrder(cmp): void;
  useBezier: boolean;
  bezierDirection: "vertical" | "horizontal",
  showConnectionArrows: boolean;
  showConnectionLabels: boolean;
};

export type TBlockConnection = {
  id: string;
  addInRenderOrder(cmp, setting: object): void;
  removeFromRenderOrder(cmp): void;
};

type TConnectionState = TConnection & {
  hovered: boolean;
};

export class BlockConnection extends withBatchedConnection(withHitTest(EventedComponent)) {
  public declare props: TConnectionProps;

  public declare state: TConnectionState;

  public declare context: TGraphLayerContext;

  public connectedState: ConnectionState;

  protected readonly unsubscribe: (() => void)[];

  private sourceBlock: Block;

  private sourceAnchor?: TAnchor;

  private targetBlock: Block;

  private targetAnchor?: TAnchor;

  private hitBoxHash = 0;

  protected path2d?: Path2D;

  private geometry = { x1: 0, x2: 0, y1: 0, y2: 0 };

  private labelGeometry = { x: 0, y: 0, width: 0, height: 0 };

  private debouncedSetHitBox: (...args: any[]) => void;

  public constructor(props: TConnectionProps, parent: GraphLayer) {
    super(props, parent);

    this.unsubscribe = this.subscribe();

    this.addEventListener("click", this);
    this.addEventListener("mouseenter", this);
    this.addEventListener("mouseleave", this);

    this.debouncedSetHitBox = frameDebouncer.add(this.updateHitBox.bind(this), {
      delay: 4 /* frames */,
      lightFrame: true,
    });

    this.updateHitBox();
  }

  protected subscribe() {
    this.connectedState = selectConnectionById(this.context.graph, this.props.id);

    this.updateSourceAndTargetBlock();
    this.state = { ...this.connectedState.$state.value, hovered: false };

    return [
      this.connectedState.$state.subscribe((state) => {
        this.setState(state);
        this.updateSourceAndTargetBlock();
      }),
    ];
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

  public propsChanged(nextProps: TBlockConnection) {
    super.propsChanged(nextProps);

    this.addInRenderOrder(nextProps, this.state);
  }

  public stateChanged(nextState) {
    this.addInRenderOrder(this.props, nextState);
  }

  public addInRenderOrder(props, state) {
    this.props.addInRenderOrder(this, this.computeRenderSettings(props, state));
  }

  protected willIterate() {
    super.willIterate();

    if (this.firstIterate) {
      this.addInRenderOrder(this.props, this.state);
      return;
    }

    this.shouldRender = this.context.camera.isLineVisible(
      this.geometry.x1,
      this.geometry.y1,
      this.geometry.x2,
      this.geometry.y2
    );
  }

  public computeRenderSettings(props, state: TConnectionState) {
    let lineWidth = 2;
    let zIndex = 1;
    let lineDash: number[] | boolean = false;
    const strokeStyle = this.getStrokeColor(state);

    if (state.selected) {
      zIndex = 2;
    } else if (state.hovered) {
      zIndex = 3;
    }

    if (state.dashed) {
      lineDash = state.styles?.dashes || [6, 4];
    }

    if (state.hovered || state.selected) {
      lineWidth = 4;
    }

    return { zIndex, lineWidth, lineDash, strokeStyle };
  }

  public get zIndex() {
    return this.context.constants.connection.DEFAULT_Z_INDEX;
  }

  protected unmount() {
    super.unmount();

    this.unsubscribe.forEach((reactionDisposer) => reactionDisposer());
  }

  protected didRender() {
    super.didRender();

    const hash = this.geometry.x1 + this.geometry.y1 + this.geometry.x2 + this.geometry.y2;

    if (this.hitBoxHash !== hash) {
      this.hitBoxHash = hash;
      this.updateHitBox();
    }
  }

  public handleEvent(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();

    switch (event.type) {
      case "click":
        this.context.graph.api.selectConnections(
          [this.props.id],
          !isMetaKeyEvent(event) ? true : !this.state.selected,
          !isMetaKeyEvent(event) ? ESelectionStrategy.REPLACE : ESelectionStrategy.APPEND
        );
        break;
      case "mouseenter":
        this.setState({ hovered: true });
        break;
      case "mouseleave":
        this.setState({ hovered: false });
        break;
    }
  }

  private updateHitBox = () => {
    const labelGeometry = this.labelGeometry;
    let minX: number;
    let maxX: number;
    let minY: number;
    let maxY: number;

    const threshold = this.context.constants.connection.THRESHOLD_LINE_HIT;

    if (this.props.useBezier) {
      const line_points = generateBezierParams(
        {
          x: this.geometry.x1,
          y: this.geometry.y1,
        },
        {
          x: this.geometry.x2,
          y: this.geometry.y2,
        },
        this.props.bezierDirection,
      );
      const Ys = line_points.map(({ y }) => y);
      const Xs = line_points.map(({ x }) => x);

      minX = Math.min(...Xs);
      maxX = Math.max(...Xs);
      minY = Math.min(...Ys);
      maxY = Math.max(...Ys);
    } else {
      minX = Math.min(this.geometry.x1, this.geometry.x2);
      maxX = Math.max(this.geometry.x1, this.geometry.x2);
      minY = Math.min(this.geometry.y1, this.geometry.y2);
      maxY = Math.max(this.geometry.y1, this.geometry.y2);
    }

    if (labelGeometry !== undefined) {
      minX = Math.min(minX, labelGeometry.x);
      maxX = Math.max(maxX, labelGeometry.x + labelGeometry.width);
      minY = Math.min(minY, labelGeometry.y);
      maxY = Math.max(maxY, labelGeometry.y + labelGeometry.height);
    }
    this.setHitBox(minX - threshold, minY - threshold, maxX + threshold, maxY + threshold);
  };

  public onHitBox(shape: HitBoxData): boolean {
    const THRESHOLD_LINE_HIT = this.context.constants.connection.THRESHOLD_LINE_HIT;
    const relativeTreshold = THRESHOLD_LINE_HIT / this.context.camera.getCameraScale();
    const x = (shape.minX + shape.maxX) / 2;
    const y = (shape.minY + shape.maxY) / 2;

    const superHit = super.onHitBox(shape);

    const intersectsLine =
      this.props.useBezier && this.path2d
        ? isPointInStroke(this.context.ctx, this.path2d, shape.x, shape.y, THRESHOLD_LINE_HIT * 2)
        : intersects.boxLine(
            x - relativeTreshold / 2,
            y - relativeTreshold / 2,
            relativeTreshold,
            relativeTreshold,
            this.geometry.x1,
            this.geometry.y1,
            this.geometry.x2,
            this.geometry.y2
          );

    if (this.labelGeometry !== undefined) {
      return (
        superHit &&
        (intersectsLine ||
          intersects.boxBox(
            x - relativeTreshold / 2,
            y - relativeTreshold / 2,
            relativeTreshold,
            relativeTreshold,
            this.labelGeometry.x,
            this.labelGeometry.y,
            this.labelGeometry.width,
            this.labelGeometry.height
          ))
      );
    } else {
      return superHit && intersectsLine;
    }
  }

  private updateGeometry(sourceBlock: Block, targetBlock: Block) {
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
    }
  }

  private renderLabelText() {
    const padding = this.context.constants.system.GRID_SIZE / 8;
    const fontSize = Math.max(14, getFontSize(9, this.context.camera.getCameraScale()));
    const font = `${fontSize}px sans-serif`;

    const measure = cachedMeasureText(this.state.label, {
      font,
    });
    const height = measure.height;
    const width = measure.width;

    const { x, y, aligment } = getLabelCoords(
      this.geometry.x1,
      this.geometry.y1,
      this.geometry.x2,
      this.geometry.y2,
      measure.width + padding * 2,
      measure.height,
      this.context.constants.system.GRID_SIZE
    );

    this.labelGeometry = { x, y, width, height };

    this.context.ctx.fillStyle = this.context.colors.connectionLabel.text;

    if (this.state.hovered) this.context.ctx.fillStyle = this.context.colors.connectionLabel.hoverText;
    if (this.state.selected) this.context.ctx.fillStyle = this.context.colors.connectionLabel.selectedText;

    this.context.ctx.textBaseline = "top";
    this.context.ctx.textAlign = aligment;
    this.context.ctx.font = font;
    this.context.ctx.fillText(this.state.label, x + padding, y + padding);

    this.context.ctx.fillStyle = this.context.colors.connectionLabel.background;

    if (this.state.hovered) this.context.ctx.fillStyle = this.context.colors.connectionLabel.hoverBackground;
    if (this.state.selected) this.context.ctx.fillStyle = this.context.colors.connectionLabel.selectedBackground;

    this.context.ctx.fillRect(x, y, measure.width, measure.height);
  }

  public renderArrow() {
    const coords = getArrowCoords(
      this.props.useBezier,
      this.geometry.x1,
      this.geometry.y1,
      this.geometry.x2,
      this.geometry.y2,
      this.props.bezierDirection,
    );

    this.context.ctx.moveTo(coords[0], coords[1]);
    this.context.ctx.lineTo(coords[2], coords[3]);
    this.context.ctx.lineTo(coords[4], coords[5]);
  }

  public getStrokeColor(state: TConnection) {
    if (state.selected) return state.styles?.selectedBackground || this.context.colors.connection.selectedBackground;

    return state.styles?.background || this.context.colors.connection.background;
  }

  public render() {
    super.render();

    this.updateGeometry(this.sourceBlock, this.targetBlock);

    const cameraClose =
      this.context.camera.getCameraScale() >= this.context.constants.connection.MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL;

    if (this.props.showConnectionArrows && cameraClose) {
      this.renderArrow();
    }

    if (this.state.label && this.props.showConnectionLabels && cameraClose) {
      this.renderLabelText();
    }

    if (this.props.useBezier) {
      this.path2d = bezierCurveLine(
        {
          x: this.geometry.x1,
          y: this.geometry.y1,
        },
        {
          x: this.geometry.x2,
          y: this.geometry.y2,
        },
        this.context.ctx,
        this.props.bezierDirection,
      );
      return;
    }
    this.context.ctx.moveTo(this.geometry.x1, this.geometry.y1);
    this.context.ctx.lineTo(this.geometry.x2, this.geometry.y2);

    //stroking line in withBatchedConnection
  }
}
