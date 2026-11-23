import {
  Layer,
  LayerContext,
  LayerProps,
  LegacyCanvasBlock,
  TCameraState,
  computeCssVariable,
} from "@gravity-ui/graph";
import type { TSceneElementView } from "@gravity-ui/graph";

type MiniMapPosition = Pick<CSSStyleDeclaration, "top" | "left" | "bottom" | "right">;

/**
 * D6: the throttle period of the picture, in ms of the scene clock, for every continuous change of what it shows:
 * block elements (their revisions), the blocks list, block moves and drags, the usable rect. A change when no picture
 * was drawn for this long is drawn in the next frame. A change sooner waits this long from its arrival, and every change
 * that arrives meanwhile is drawn with it: the pictures are at least this far apart, and the last change is drawn in
 * the frame after its period ends at the latest.
 */
const PICTURE_THROTTLE_MS = 100;

/** A signal-like source: `subscribe` calls the handler at once and on every change, and returns the unsubscribe. */
type TSubscribable<T> = { subscribe: (handler: (value: T) => void) => () => void };

export type TMiniMapLocation = "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | Partial<MiniMapPosition>;

export type MiniMapLayerProps = LayerProps & {
  width?: number;
  height?: number;
  classNames?: string[];
  cameraBorderSize?: number;
  cameraBorderColor?: string;
  location?: TMiniMapLocation;
};

export type MiniMapLayerContext = LayerContext & {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

export class MiniMapLayer extends Layer<MiniMapLayerProps, MiniMapLayerContext> {
  private readonly minimapCanvas: HTMLCanvasElement;
  private minimapWidth: number;
  private minimapHeight: number;
  private relativeX: number;
  private relativeY: number;
  private scale: number;
  private cameraBorderSize: number;
  private cameraBorderColor: string;

  /** The blocks' picture at the minimap's pixel size; a camera move only copies it (see `onCameraChange`). */
  private picture?: HTMLCanvasElement;

  private pictureDirty = true;

  /** Whether the last picture drew a `LegacyCanvasBlock`: such a picture is drawn again on every camera move. */
  private pictureHasLegacy = false;

  /** Scene clock (ms) when the last picture was drawn. */
  private pictureDrawnAt = -Infinity;

  /** A throttled change waits for its period to end (D6). */
  private picturePending = false;

  /** Scene clock (ms) of the first change that waits: its period ends `PICTURE_THROTTLE_MS` later. */
  private pendingSince = 0;

  /** The blocks list changed: requested at the frame's end, with the revisions the same change steps (one request). */
  private listChanged = false;

  /** The entity types whose revisions the picture follows (their unsubscribes): those the block classes use. */
  private readonly followedTypes = new Map<string, () => void>();

  /** Hidden-only updates do not change the picture, which deliberately draws hidden blocks. */
  private readonly pictureChanges = new Map<string, { revision: number; hiddenOnly: boolean }>();

  /**
   * Types of the block views on the list at the last walk, whether the `blockComponents` setting names them or not:
   * followed while such a view is on the list, released once none is and the setting does not name them
   * (`reconcileMetTypes`).
   */
  private metTypes: ReadonlySet<string> = new Set<string>();

  constructor(props: MiniMapLayerProps) {
    const classNames = [...(Array.isArray(props.classNames) ? props.classNames : []), "graph-minimap"];

    super({
      canvas: {
        zIndex: 300,
        classNames,
        transformByCameraPosition: false,
      },
      ...props,
    });

    this.minimapCanvas = this.requireCanvas();

    this.minimapWidth = this.props.width ?? 200;
    this.minimapHeight = this.props.height ?? 200;
    this.cameraBorderSize = this.props.cameraBorderSize ?? 2;
    this.cameraBorderColor = this.props.cameraBorderColor ?? "rgba(255, 119, 0, 0.9)";
    this.relativeX = 0;
    this.relativeY = 0;
    this.scale = 1;
  }

  protected afterInit(): void {
    this.applyPositionStyle();
    this.picture ??= this.minimapCanvas.ownerDocument.createElement("canvas");
    const { graph } = this.props;
    const throttled = (): void => this.requestThrottledPicture();
    // D6: every continuous change of what the picture shows, pointer drags included. The mapping (scale, relativeX/Y)
    // is computed with the picture (`drawPicture`): the picture, the camera frame and the clicks share one mapping.
    this.onChange(graph.hitTest.$usableRect, throttled);
    this.onGraphEvent("block-change", throttled);
    this.onGraphEvent("blocks-geometry-change", throttled);
    // The list order is the picture's order, and a list that only reorders changes no element. Requested at the end
    // of the frame, after the scene stepped the revisions of the same change (`onFrameEnd`): one request for both.
    this.onChange(graph.rootStore.blocksList.$blocks, () => {
      this.listChanged = true;
    });
    // The revisions of the entity types the blocks use: a block subclass may declare its own `entityType`.
    this.followedTypes.clear();
    this.pictureChanges.clear();
    const stopElements = graph.scene.store.subscribe((change) => {
      this.notePictureChange(change.type === "update" && change.fields?.size === 1 && change.fields.has("hidden"));
    });
    const stopStyles = graph.scene.store.subscribeStyles(() => this.notePictureChange(false));
    this.eventAbortController.signal.addEventListener("abort", () => {
      stopElements();
      stopStyles();
      this.pictureChanges.clear();
    });
    this.onSignal(graph.rootStore.settings.$blockComponents, () => this.followBlockTypes());
    this.onGraphFrameEnd(() => this.onFrameEnd());
    this.onGraphEvent("colors-changed", () => this.invalidatePicture());
    this.onCanvasEvent("mousedown", this.handleMouseDownEvent);
    // Attached (or attached again): the mapping before the first render, and a new picture in the next frame, which
    // shows whatever changed while detached.
    this.listChanged = false;
    this.calculateViewPortCoords();
    this.invalidatePicture();
    super.afterInit();
  }

  /** Like `onSignal`, without the call at subscription: the handler runs on changes only. */
  private onChange<T>(source: TSubscribable<T>, handler: () => void): () => void {
    let subscribed = false;
    const stop = this.onSignal(source, () => {
      if (subscribed) handler();
    });
    subscribed = true;
    return stop;
  }

  /**
   * Calls `listener` at the end of every graph frame (`graph.scene.onFrameEnd`), after the scene stepped the frame's
   * revisions, until the layer detaches or unmounts. A stopped graph runs no frames.
   */
  private onGraphFrameEnd(listener: () => void): void {
    const remove = this.props.graph.scene.onFrameEnd(listener);
    this.eventAbortController.signal.addEventListener("abort", remove, { once: true });
  }

  /** `"block"` and the entity types of the classes in the `blockComponents` setting. */
  private settingsTypes(): Set<string> {
    const types = new Set<string>(["block"]);
    const classes = this.props.graph.rootStore.settings.$blockComponents.peek();
    for (const klass of Object.values(classes)) {
      if (klass?.entityType !== undefined) types.add(klass.entityType);
    }
    return types;
  }

  private notePictureChange(hiddenOnly: boolean): void {
    for (const type of this.followedTypes.keys()) {
      const revision = this.props.graph.scene.revisionOf(type).peek();
      const known = this.pictureChanges.get(type);
      if (!known || known.revision !== revision) this.pictureChanges.set(type, { revision, hiddenOnly });
      else known.hiddenOnly &&= hiddenOnly;
    }
  }

  /**
   * Follows the revisions of `"block"`, of the classes in the `blockComponents` setting and of the types of the block
   * views on the list (`metTypes`), and stops following any other type.
   */
  private followBlockTypes(): void {
    const types = this.settingsTypes();
    this.metTypes.forEach((type) => types.add(type));
    this.followedTypes.forEach((stop, type) => {
      if (types.has(type)) return;
      stop();
      this.followedTypes.delete(type);
      this.pictureChanges.delete(type);
    });
    for (const type of types) {
      if (this.followedTypes.has(type)) continue;
      const revision = this.props.graph.scene.revisionOf(type);
      this.followedTypes.set(
        type,
        this.onChange(revision, () => {
          const changes = this.pictureChanges.get(type);
          // Key by the counter: changes made by frame-end listeners already belong to its next revision.
          if (changes?.revision === revision.peek() - 1 && changes.hiddenOnly) return;
          this.requestThrottledPicture();
        })
      );
    }
  }

  /**
   * The types of the block views the walk met replace those met before. Followed are their union with the setting's
   * types (`followBlockTypes`): a type is released only when neither the setting nor a block view on the list uses it.
   * A type the picture's query left out (its blocks were not drawn) asks for the next picture.
   */
  private reconcileMetTypes(seen: ReadonlySet<string>): void {
    // Every current view's type, also one the setting names: the setting may stop naming it while the view stays.
    const same = seen.size === this.metTypes.size && Array.from(seen).every((type) => this.metTypes.has(type));
    if (same) return;
    const missed = Array.from(seen).some((type) => !this.followedTypes.has(type));
    this.metTypes = new Set(seen);
    this.followBlockTypes();
    if (missed) this.requestThrottledPicture();
  }

  protected onCameraChange(_camera: TCameraState): void {
    // Legacy blocks may draw from data the scene does not see: a picture with them is drawn again, as before.
    if (this.pictureHasLegacy) this.pictureDirty = true;
    this.performRender();
  }

  protected updateCanvasSize(): void {
    const canvas = this.minimapCanvas;
    const dpr = this.getDRP();
    canvas.width = this.minimapWidth * dpr;
    canvas.height = this.minimapHeight * dpr;
    this.pictureDirty = true;
  }

  protected render(): void {
    if (!this.context?.ctx) return;
    this.resetTransform();
    // Also for an empty usable rect: the picture brings its mapping, which the clicks use.
    if (this.pictureDirty) this.drawPicture();
    const usableRect = this.props.graph.api.getUsableRect();
    if (usableRect.width === 0 && usableRect.height === 0) return;
    const picture = this.picture;
    if (picture && picture.width > 0 && picture.height > 0) {
      this.context.ctx.drawImage(picture, 0, 0, this.minimapWidth, this.minimapHeight);
    }
    this.context.ctx.scale(this.scale, this.scale);
    this.context.ctx.translate(-this.relativeX, -this.relativeY);
    this.drawCameraBorderFrame();
  }

  /** The picture is drawn again in the next frame. */
  private invalidatePicture(): void {
    this.pictureDirty = true;
    this.performRender();
  }

  private clockMs(): number {
    return this.props.graph.scene.clock.now() * 1000;
  }

  /**
   * D6: a continuous change of what the picture shows. When no picture was drawn for the period, it is drawn in the
   * next frame (an isolated selection shows at once). Sooner, it waits the period from its arrival, together with every
   * change that arrives meanwhile.
   */
  private requestThrottledPicture(): void {
    // Already asked for (the next render draws it), or waiting.
    if (this.pictureDirty || this.picturePending) return;
    const now = this.clockMs();
    if (now - this.pictureDrawnAt >= PICTURE_THROTTLE_MS) {
      this.invalidatePicture();
      return;
    }
    this.pendingSince = now;
    this.picturePending = true;
  }

  /**
   * At the end of a graph frame, after the scene stepped its revisions: a list change joins their request, and a waiting
   * picture whose period has ended is drawn in the next frame.
   */
  private onFrameEnd(): void {
    if (this.listChanged) {
      this.listChanged = false;
      this.requestThrottledPicture();
    }
    if (!this.picturePending || this.clockMs() < this.pendingSince + PICTURE_THROTTLE_MS) return;
    this.picturePending = false;
    this.invalidatePicture();
  }

  /** Draws the usable rect's background and the blocks into the picture, in device pixels. */
  private drawPicture(): void {
    const picture = this.picture;
    if (!picture) return;
    this.pictureDirty = false;
    // The picture shows every change made so far: nothing waits any more.
    this.picturePending = false;
    this.pictureDrawnAt = this.clockMs();
    // The mapping of this picture: the camera frame and the clicks use it until the next picture.
    this.calculateViewPortCoords();
    const { width, height } = this.minimapCanvas;
    // A new size clears the bitmap; the same size keeps it, so it is cleared here.
    const resized = picture.width !== width || picture.height !== height;
    if (resized) {
      picture.width = width;
      picture.height = height;
    }
    const ctx = picture.getContext("2d");
    if (!ctx) return;
    if (!resized) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
    }
    const k = this.getDRP() * this.scale;
    ctx.setTransform(k, 0, 0, k, -this.relativeX * k, -this.relativeY * k);
    this.renderUsableRectBelow(ctx);
    this.renderBlocks(ctx);
  }

  private applyPositionStyle(): void {
    const canvas = this.minimapCanvas;
    Object.assign(canvas.style, this.getPositionOfMiniMap(this.props.location), {
      width: `${this.minimapWidth}px`,
      height: `${this.minimapHeight}px`,
    });
  }

  private calculateViewPortCoords(): void {
    const usableRect = this.props.graph.api.getUsableRect();

    const xPos = usableRect.x - this.context.constants.system.USABLE_RECT_GAP;
    const yPos = usableRect.y - this.context.constants.system.USABLE_RECT_GAP;
    const width = usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2;
    const height = usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2;

    if (width > height) {
      this.scale = this.minimapWidth / width;
    } else {
      this.scale = this.minimapHeight / height;
    }

    // if minimap not rectangle
    if (height > this.minimapHeight / this.scale) this.scale = this.minimapHeight / height;
    if (width > this.minimapWidth / this.scale) this.scale = this.minimapWidth / width;

    this.relativeX = xPos + width / 2 - this.minimapWidth / this.scale / 2;
    this.relativeY = yPos + height / 2 - this.minimapHeight / this.scale / 2;
  }

  // eslint-disable-next-line complexity
  private drawCameraBorderFrame(): void {
    const cameraState = this.props.camera.getCameraState();

    const relativeXRight = this.relativeX + this.minimapWidth / this.scale;
    const relativeYBottom = this.relativeY + this.minimapHeight / this.scale;

    let width = cameraState.relativeWidth;
    let height = cameraState.relativeHeight;
    //camera inverted
    let xPos = -cameraState.relativeX;
    let yPos = -cameraState.relativeY;

    const scaledCameraBorderSize = this.cameraBorderSize / this.scale;

    if (xPos <= this.relativeX && xPos + width <= this.relativeX) {
      xPos = this.relativeX;
      width = scaledCameraBorderSize;
    } else if (xPos <= this.relativeX && xPos + width > this.relativeX && xPos + width <= relativeXRight) {
      width = width - (this.relativeX - xPos);
      xPos = this.relativeX;
    } else if (xPos <= this.relativeX && xPos + width > relativeXRight) {
      xPos = this.relativeX;
      width = this.minimapWidth / this.scale;
    } else if (xPos >= this.relativeX && xPos < relativeXRight && xPos + width <= relativeXRight) {
      // do nothing
    } else if (xPos >= this.relativeX && xPos < relativeXRight && xPos + width > relativeXRight) {
      width = this.minimapWidth / this.scale - (xPos - this.relativeX);
    } else if (xPos >= relativeXRight && xPos + width > relativeXRight) {
      xPos = relativeXRight - scaledCameraBorderSize;
      width = scaledCameraBorderSize;
    }

    if (yPos <= this.relativeY && yPos + height <= this.relativeY) {
      yPos = this.relativeY;
      height = scaledCameraBorderSize;
    } else if (yPos <= this.relativeY && yPos + height > this.relativeY && yPos + height <= relativeYBottom) {
      height = height - (this.relativeY - yPos);
      yPos = this.relativeY;
    } else if (yPos <= this.relativeY && yPos + height > relativeYBottom) {
      yPos = this.relativeY;
      height = this.minimapHeight / this.scale;
    } else if (yPos >= this.relativeY && yPos < relativeYBottom && yPos + height <= relativeYBottom) {
      // do nothing
    } else if (yPos >= this.relativeY && yPos < relativeYBottom && yPos + height > relativeYBottom) {
      height = this.minimapHeight / this.scale - (yPos - this.relativeY);
    } else if (yPos >= relativeYBottom && yPos + height > relativeYBottom) {
      yPos = relativeYBottom - scaledCameraBorderSize;
      height = scaledCameraBorderSize;
    }

    this.context.ctx.lineWidth = scaledCameraBorderSize;
    this.context.ctx.strokeStyle = computeCssVariable(this.cameraBorderColor);

    this.context.ctx.strokeRect(xPos, yPos, width, height);
  }

  protected getPositionOfMiniMap(location: TMiniMapLocation = "topLeft"): MiniMapPosition {
    const offsets: Partial<MiniMapPosition> =
      typeof location === "string"
        ? {
            topLeft: { top: "0px", left: "0px" },
            topRight: { top: "0px", right: "0px" },
            bottomLeft: { bottom: "0px", left: "0px" },
            bottomRight: { bottom: "0px", right: "0px" },
          }[location] ?? {}
        : location;
    return {
      top: offsets.top ?? "unset",
      left: offsets.left ?? "unset",
      bottom: offsets.bottom ?? "unset",
      right: offsets.right ?? "unset",
    };
  }

  private renderUsableRectBelow(ctx: CanvasRenderingContext2D): void {
    const usableRect = this.props.graph.api.getUsableRect();

    ctx.fillStyle = computeCssVariable(this.context.colors.canvas.layerBackground);
    const xPos = usableRect.x - this.context.constants.system.USABLE_RECT_GAP;
    const yPos = usableRect.y - this.context.constants.system.USABLE_RECT_GAP;
    const width = usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2;
    const height = usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2;

    ctx.fillRect(xPos, yPos, width, height);
  }

  /**
   * The blocks in the list order (`$blocks`), as v1: runs of scene blocks through the interpreter, from the scene's
   * elements in the minimap's view of the entity types the blocks use, each with its own metadata, and
   * `LegacyCanvasBlock`s with their own minimalistic method in between. The list decides what is drawn, so a block
   * subclass with an `entityType` of its own stays on the minimap. The minimap's own rules: the minimalistic level
   * whatever the main view's, no text, blocks handed to HTML and in collapsed groups included, no anchors or other
   * elements.
   */
  private renderBlocks(ctx: CanvasRenderingContext2D): void {
    const { graph } = this.props;
    const rect = {
      x: this.relativeX,
      y: this.relativeY,
      width: this.minimapWidth / this.scale,
      height: this.minimapHeight / this.scale,
    };
    const entityTypes = Array.from(this.followedTypes.keys());
    const byId = new Map<string, TSceneElementView>();
    const query = { level: "minimalistic", includeHidden: true, entityTypes } as const;
    for (const element of graph.scene.queryLive(rect, query)) byId.set(element.id, element);
    let run: TSceneElementView[] = [];
    let legacy = false;
    // The types of the block views on the list: each is followed while such a view is there.
    const seen = new Set<string>();
    const flush = (): void => {
      if (run.length === 0) return;
      graph.scene.drawInterpreted(ctx, run, this.scale, { level: "minimalistic", skipText: true, drawHidden: true });
      run = [];
    };
    graph.rootStore.blocksList.$blocks.value.forEach((block) => {
      const view = block.getViewComponent();
      if (view instanceof LegacyCanvasBlock) {
        legacy = true;
        flush();
        view.renderMinimalisticBlock(ctx, { text: false });
        return;
      }
      if (!view) return;
      const type = (view.constructor as { entityType?: string }).entityType;
      if (type !== undefined) seen.add(type);
      const element = byId.get(view.getSceneElementId());
      if (element) run.push(element);
    });
    flush();
    this.pictureHasLegacy = legacy;
    this.reconcileMetTypes(seen);
  }

  private onCameraDrag(event: MouseEvent): void {
    const cameraState = this.props.camera.getCameraState();

    const x = -(this.relativeX + event.offsetX / this.scale) + cameraState.relativeWidth / 2;
    const y = -(this.relativeY + event.offsetY / this.scale) + cameraState.relativeHeight / 2;

    const dx = x * cameraState.scale - cameraState.x;
    const dy = y * cameraState.scale - cameraState.y;

    this.context.camera.move(dx, dy);
  }

  private handleMouseDownEvent = (rootEvent: MouseEvent): void => {
    rootEvent.stopPropagation();
    this.onCameraDrag(rootEvent);

    this.context.graph.dragService.startDrag(
      { onUpdate: (event: MouseEvent) => this.onCameraDrag(event) },
      { stopOnMouseLeave: true, autopanning: false, cursor: "move" }
    );
  };
}
