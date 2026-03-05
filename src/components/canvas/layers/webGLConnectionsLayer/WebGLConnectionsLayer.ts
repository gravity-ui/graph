import { LayerProps } from "../../../../services/Layer";
import { WebGLLayer } from "../WebGLLayer";
import { TGraphLayerContext } from "../graphLayer/GraphLayer";

import { HoverGlowEngine } from "./HoverGlowEngine";
import { LineWebGLEngine, TConnectionStyle, TEngineSlot } from "./LineWebGLEngine";
import { WebGLBlockConnections } from "./WebGLBlockConnections";
import { WebGLConnection } from "./WebGLConnection";

function parseCSSColor(css: string): [number, number, number, number] {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(",").map(parseFloat);
    return [p[0] / 255, p[1] / 255, p[2] / 255, p[3] ?? 1];
  }
  if (css.startsWith("#")) {
    const h = css.slice(1);
    const e =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    return [
      parseInt(e.slice(0, 2), 16) / 255,
      parseInt(e.slice(2, 4), 16) / 255,
      parseInt(e.slice(4, 6), 16) / 255,
      e.length === 8 ? parseInt(e.slice(6, 8), 16) / 255 : 1,
    ];
  }
  return [1, 1, 1, 1];
}

export type TWebGLConnectionsLayerProps = LayerProps;

export class WebGLConnectionsLayer extends WebGLLayer<TWebGLConnectionsLayerProps, TGraphLayerContext> {
  private engine: LineWebGLEngine | null = null;
  private glowEngine: HoverGlowEngine | null = null;

  constructor(props: TWebGLConnectionsLayerProps) {
    super({
      canvas: {
        zIndex: 1,
        classNames: ["no-user-select", "no-pointer-events", "webgl-connections-canvas"],
        transformByCameraPosition: true,
      },
      ...props,
    });
  }

  protected override afterWebGLInit(): void {
    this.engine = new LineWebGLEngine(this.regl);
    this.engine.init();

    this.glowEngine = new HoverGlowEngine(this.regl);
    this.glowEngine.init();

    this.onGraphEvent("colors-changed", () => this.assignSlots());

    // Canvas has no-pointer-events, so we listen on the root element instead.
    this.onRootEvent("mousemove", this.handleMouseMove);
    this.onRootEvent("mouseleave", this.handleMouseLeave);
  }

  protected override unmountLayer(): void {
    this.engine?.destroy();
    this.engine = null;
    this.glowEngine?.destroy();
    this.glowEngine = null;
    super.unmountLayer();
  }

  public override updateChildren() {
    return [WebGLBlockConnections.create({})];
  }

  /**
   * O(1) update for a single connection slot.
   * Called by WebGLConnection when its geometry or state changes.
   */
  public updateSlot(slotIndex: number, conn: WebGLConnection): void {
    if (!this.engine || !conn.connectionPoints) return;
    const [src, tgt] = conn.connectionPoints;
    const style = this.getConnectionStyle(conn);

    this.engine.updateSlot(slotIndex, src, tgt, style);

    if (conn.isHovered) {
      this.glowEngine?.setHovered(src, tgt, style.width);
    } else {
      this.glowEngine?.clear();
    }

    this.performRender();
  }

  /**
   * Rebuilds all slot indices and does a full GPU buffer upload.
   * Called by WebGLBlockConnections.didUpdateChildren() and on color changes.
   */
  public assignSlots(): void {
    if (!this.engine) return;
    const connections = this.context.graph.rootStore.connectionsList.$connections.value;

    const slots: TEngineSlot[] = connections.map((connState, i) => {
      const viewComp = connState.getViewComponent() as WebGLConnection | undefined;
      if (!viewComp?.connectionPoints) return null;
      viewComp.slotIndex = i;
      const [src, tgt] = viewComp.connectionPoints;
      return { src, tgt, style: this.getConnectionStyle(viewComp) };
    });

    this.engine.assignSlots(slots);
    this.performRender();
  }

  private getConnectionStyle(conn: WebGLConnection): TConnectionStyle {
    const { colors } = this.context;
    const normalColor = parseCSSColor(colors.connection?.background ?? "#272727");
    const selectedColor = parseCSSColor(colors.connection?.selectedBackground ?? "#ecc113");
    const isActive = conn.isSelected || conn.isHovered;
    return {
      color: conn.isSelected ? selectedColor : normalColor,
      width: isActive ? 4 : 2,
      dashed: conn.state.dashed ? 1 : 0,
    };
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.glowEngine) return;
    const rect = this.root.getBoundingClientRect();
    const [worldX, worldY] = this.context.camera.applyToPoint(e.clientX - rect.left, e.clientY - rect.top);
    this.glowEngine.setMouseWorld(worldX, worldY);
    this.performRender();
  };

  private handleMouseLeave = (): void => {
    this.performRender();
  };

  protected override drawScene(): void {
    this.engine?.draw(); // pass 1: все связи, alpha blending
    // this.glowEngine?.draw(); // pass 2: hovered связь, additive blending
  }
}
